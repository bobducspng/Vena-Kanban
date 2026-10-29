import { randomBytes } from "node:crypto";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db/client.js";
import { fieldConditions, fields, phases, pipes, publicForms } from "./db/schema.js";
import { env } from "./env.js";

/**
 * Formulário público (M7): a pipe's start form opened to people without login.
 * Only "safe" field types are shown — never ones that would expose internal data
 * (connections list records/cards; people/labels pickers list the team).
 */

export const PUBLIC_TYPES = new Set([
  "short_text", "long_text", "number", "currency", "date", "datetime", "time", "due_date",
  "email", "phone", "document", "select", "radio", "checklist", "checkbox",
]);
/** Types the team completes later (required ones do not block a public submission). */
export const NOT_PUBLIC_TYPES = ["connection", "assignee_select", "label_select", "attachment", "id"];

export const branding = z.object({
  description: z.string().max(4000).default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2f5bea"),
  buttonText: z.string().max(60).default("Enviar"),
  confirmMessage: z.string().max(2000).default("Recebemos sua solicitação. Obrigado!"),
  allowMultiple: z.boolean().default(true), // "enviar outra resposta" after submitting
  askEmail: z.enum(["no", "optional", "required"]).default("optional"), // requester e-mail (confirmation + tracking)
});
export type Branding = z.infer<typeof branding>;
export const readBranding = (raw: unknown): Branding => branding.parse(raw ?? {});

/** URL-safe random token (43 chars, 256 bits). */
export const newToken = () => randomBytes(32).toString("base64url");
export const formUrl = (slug: string) => `${env.PUBLIC_BASE_URL}/f/${slug}`;

/** The form, its pipe and start phase — only when published and the pipe is alive. */
export async function liveForm(slug: string) {
  const row = (await db.select({ form: publicForms, pipeName: pipes.name, pipeIcon: pipes.icon, orgId: pipes.orgId, titleFieldId: pipes.titleFieldId })
    .from(publicForms).innerJoin(pipes, eq(pipes.id, publicForms.pipeId))
    .where(and(eq(publicForms.slug, slug), eq(publicForms.isPublic, true), isNull(pipes.deletedAt))).limit(1))[0];
  if (!row) return null;
  const start = (await db.select().from(phases).where(and(eq(phases.pipeId, row.form.pipeId), eq(phases.isStart, true))).limit(1))[0];
  return start ? { ...row, start } : null;
}

/** What the public page needs: safe fields of the start form + their conditionals. */
export async function publicDefinition(slug: string) {
  const f = await liveForm(slug);
  if (!f) return null;
  const startFields = (await db.select().from(fields).where(and(eq(fields.phaseId, f.start.id), isNull(fields.archivedAt))))
    .filter((x) => PUBLIC_TYPES.has(x.type))
    .sort((a, b) => a.position - b.position)
    .map((x) => ({
      id: x.id, label: x.label, type: x.type, required: x.required, options: x.options, description: x.description,
      help: x.help, validationRegex: x.validationRegex, isUnique: false, position: x.position, phaseId: x.phaseId,
    }));
  const visibleIds = new Set(startFields.map((x) => x.id));
  const conds = (await db.select().from(fieldConditions).where(eq(fieldConditions.phaseId, f.start.id)))
    // a conditional that reads or changes a hidden (non-public) field cannot run on the page
    .filter((c) => (c.groups as { fieldId: string }[][]).every((g) => g.every((r) => visibleIds.has(r.fieldId))))
    .map((c) => ({ ...c, onTrue: (c.onTrue as { fieldId: string }[]).filter((a) => visibleIds.has(a.fieldId)), onFalse: (c.onFalse as { fieldId: string }[]).filter((a) => visibleIds.has(a.fieldId)) }));
  return {
    title: f.form.title || f.pipeName,
    pipeIcon: f.pipeIcon,
    closed: f.form.closed,
    branding: readBranding(f.form.branding),
    fields: startFields,
    conditions: conds,
  };
}
