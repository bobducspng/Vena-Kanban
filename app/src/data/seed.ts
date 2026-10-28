// Seed data so screens have something real to show. Fresh copy, fresh words —
// nothing borrowed from the original app.
import type { User, Pipe, Phase, FieldDef, Card, CardEvent } from "./types";

export const users: User[] = [
  { id: "u1", name: "Ana Souza", email: "ana@empresa.com", avatarColor: "blue" },
  { id: "u2", name: "Bruno Lima", email: "bruno@empresa.com", avatarColor: "green" },
  { id: "u3", name: "Carla Dias", email: "carla@empresa.com", avatarColor: "purple" },
];

export const currentUserId = "u1";

export const pipes: Pipe[] = [
  {
    id: "p1",
    name: "Solicitações de compra",
    description: "Pedidos de compra do início à aprovação.",
    createdAt: "2026-10-01T12:00:00Z",
  },
];

export const phases: Phase[] = [
  { id: "ph1", pipeId: "p1", name: "Novo pedido", color: "gray", position: 0, isStart: true, isEnd: false, canCreateCard: false, allowedTo: [] },
  { id: "ph2", pipeId: "p1", name: "Em análise", color: "blue", position: 1, isStart: false, isEnd: false, canCreateCard: false, allowedTo: [] },
  { id: "ph3", pipeId: "p1", name: "Aprovação", color: "amber", position: 2, isStart: false, isEnd: false, canCreateCard: false, allowedTo: [] },
  { id: "ph4", pipeId: "p1", name: "Concluído", color: "green", position: 3, isStart: false, isEnd: true, canCreateCard: false, allowedTo: [] },
];

export const fields: FieldDef[] = [
  { id: "f1", pipeId: "p1", phaseId: "ph1", label: "Item solicitado", type: "short_text", required: true, position: 0, editableOtherPhases: true, isUnique: false },
  { id: "f2", pipeId: "p1", phaseId: "ph1", label: "Valor estimado", type: "currency", required: true, position: 1, editableOtherPhases: true, isUnique: false },
  { id: "f3", pipeId: "p1", phaseId: "ph1", label: "Justificativa", type: "long_text", required: false, position: 2, editableOtherPhases: true, isUnique: false },
  {
    id: "f4", pipeId: "p1", phaseId: "ph1", label: "Urgência", type: "select", required: false,
    options: ["Baixa", "Média", "Alta"], position: 3, editableOtherPhases: true, isUnique: false,
  },
];

export const cards: Card[] = [
  {
    id: "c1", number: 1, pipeId: "p1", currentPhaseId: "ph1", title: "Notebooks para o time de vendas",
    values: [
      { fieldId: "f1", value: "5 notebooks" },
      { fieldId: "f2", value: 25000 },
      { fieldId: "f4", value: "Alta" },
    ],
    assigneeIds: ["u2"], dueDate: null, done: false, version: 0, createdAt: "2026-10-20T09:00:00Z", labelIds: [], checklistDone: 0, checklistTotal: 0, commentCount: 0, attachmentCount: 0,
  },
  {
    id: "c2", number: 2, pipeId: "p1", currentPhaseId: "ph2", title: "Licenças de software de design",
    values: [
      { fieldId: "f1", value: "3 licenças anuais" },
      { fieldId: "f2", value: 8400 },
    ],
    assigneeIds: ["u3"], dueDate: null, done: false, version: 0, createdAt: "2026-10-18T14:30:00Z", labelIds: [], checklistDone: 0, checklistTotal: 0, commentCount: 0, attachmentCount: 0,
  },
];

export const events: CardEvent[] = [
  { id: "e1", cardId: "c1", type: "created", actorId: "u1", createdAt: "2026-10-20T09:00:00Z" },
  { id: "e2", cardId: "c2", type: "created", actorId: "u1", createdAt: "2026-10-18T14:30:00Z" },
  { id: "e3", cardId: "c2", type: "moved", fromPhaseId: "ph1", toPhaseId: "ph2", actorId: "u1", createdAt: "2026-10-19T10:00:00Z" },
];
