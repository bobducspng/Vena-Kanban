import { eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "./db/client.js";
import {
  pipes, phases, phaseTransitions, phaseAssignees, fields, labels, fieldConditions, automationRules, emailTemplates, pipeMembers, pdfTemplates,
} from "./db/schema.js";

/**
 * Clonar pipe (M10b): the whole configuration — phases, "Mover para", responsáveis
 * da fase, fields, etiquetas, condicionais, automações, templates de e-mail, modelos de PDF and
 * members — without cards, public form or history. Every id gets a new one; ids
 * inside JSON settings (conditions, automation triggers/actions, connection
 * settings) are rewritten through the same map, so the copy points at itself.
 * Automations come over turned off: the admin reviews them before they run.
 */
export async function clonePipe(sourceId: string, orgId: string, name: string, userId: string) {
  const src = (await db.select().from(pipes).where(eq(pipes.id, sourceId)).limit(1))[0];
  if (!src || src.orgId !== orgId || src.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Pipe não encontrado" });

  const srcPhases = await db.select().from(phases).where(eq(phases.pipeId, sourceId));
  const phaseIds = srcPhases.map((p) => p.id);
  const [srcFields, srcLabels, srcConds, srcRules, srcTpls, srcMembers, srcTrans, srcPhaseAss, srcPdfs] = await Promise.all([
    db.select().from(fields).where(eq(fields.pipeId, sourceId)),
    db.select().from(labels).where(eq(labels.pipeId, sourceId)),
    db.select().from(fieldConditions).where(eq(fieldConditions.pipeId, sourceId)),
    db.select().from(automationRules).where(eq(automationRules.pipeId, sourceId)),
    db.select().from(emailTemplates).where(eq(emailTemplates.pipeId, sourceId)),
    db.select().from(pipeMembers).where(eq(pipeMembers.pipeId, sourceId)),
    phaseIds.length ? db.select().from(phaseTransitions).where(inArray(phaseTransitions.fromPhaseId, phaseIds)) : [],
    phaseIds.length ? db.select().from(phaseAssignees).where(inArray(phaseAssignees.phaseId, phaseIds)) : [],
    db.select().from(pdfTemplates).where(eq(pdfTemplates.pipeId, sourceId)),
  ]);

  const map = new Map<string, string>([[sourceId, crypto.randomUUID()]]);
  for (const r of [...srcPhases, ...srcFields, ...srcLabels, ...srcConds, ...srcRules, ...srcTpls, ...srcPdfs]) map.set(r.id, crypto.randomUUID());
  const id = (old: string) => map.get(old) ?? old;
  const idN = (old: string | null) => (old ? id(old) : old);
  // Ids are UUIDs, so a plain text replace inside JSON cannot hit anything else.
  const pattern = new RegExp([...map.keys()].join("|"), "g");
  const json = <T>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v).replace(pattern, (m) => map.get(m)!)));

  const newId = id(sourceId);
  await db.transaction(async (tx) => {
    const { id: _i, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = src;
    await tx.insert(pipes).values({ ...rest, id: newId, name, createdBy: userId, titleFieldId: idN(src.titleFieldId), subtitleFieldIds: json(src.subtitleFieldIds) });
    for (const { createdAt: _, ...p } of srcPhases) await tx.insert(phases).values({ ...p, id: id(p.id), pipeId: newId });
    for (const { createdAt: _, ...f } of srcFields) await tx.insert(fields).values({ ...f, id: id(f.id), pipeId: newId, phaseId: id(f.phaseId), options: json(f.options), settings: json(f.settings) });
    for (const l of srcLabels) await tx.insert(labels).values({ ...l, id: id(l.id), pipeId: newId });
    if (srcTrans.length) await tx.insert(phaseTransitions).values(srcTrans.map((t) => ({ fromPhaseId: id(t.fromPhaseId), toPhaseId: id(t.toPhaseId) })));
    if (srcPhaseAss.length) await tx.insert(phaseAssignees).values(srcPhaseAss.map((a) => ({ phaseId: id(a.phaseId), userId: a.userId })));
    for (const { createdAt: _, ...c } of srcConds) {
      await tx.insert(fieldConditions).values({ ...c, id: id(c.id), pipeId: newId, phaseId: id(c.phaseId), groups: json(c.groups), onTrue: json(c.onTrue), onFalse: json(c.onFalse) });
    }
    for (const { createdAt: _c2, updatedAt: _u2, ...r } of srcRules) {
      await tx.insert(automationRules).values({
        ...r, id: id(r.id), pipeId: newId, active: false, trigger: json(r.trigger), groups: json(r.groups), actions: json(r.actions),
        state: null, lastRunAt: null, lastStatus: null, lastError: null, createdBy: userId,
      });
    }
    for (const { createdAt: _c3, updatedAt: _u3, ...t } of srcTpls) await tx.insert(emailTemplates).values({ ...t, id: id(t.id), pipeId: newId });
    for (const { createdAt: _c4, updatedAt: _u4, ...t } of srcPdfs) await tx.insert(pdfTemplates).values({ ...t, id: id(t.id), pipeId: newId });
    if (srcMembers.length) await tx.insert(pipeMembers).values(srcMembers.map((m) => ({ pipeId: newId, userId: m.userId, role: m.role })));
  });
  return { pipeId: newId, automations: srcRules.length };
}
