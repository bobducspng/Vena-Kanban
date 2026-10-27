// Domain types for the process app. These mirror replica/schema.sql so that the
// fake data layer and the future tRPC/MySQL backend share one shape.

export type Role = "admin" | "member" | "guest";

export type FieldType =
  | "short_text" | "long_text" | "email" | "phone" | "number" | "currency"
  | "date" | "datetime" | "due_date" | "select" | "radio" | "checkbox"
  | "assignee_select" | "attachment" | "statement";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarColor: string; // one of the label-* roles, for the avatar
}

export interface FieldDef {
  id: string;
  pipeId: string;
  phaseId: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[]; // for select/radio/checkbox
  position: number;
}

export interface Phase {
  id: string;
  pipeId: string;
  name: string;
  color: string; // a label-* role name, e.g. "blue"
  position: number;
  isStart: boolean;
  isEnd: boolean;
}

export interface Pipe {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface CardFieldValue {
  fieldId: string;
  value: string | number | boolean | null;
}

export interface Card {
  id: string;
  pipeId: string;
  currentPhaseId: string;
  title: string;
  values: CardFieldValue[];
  assigneeIds: string[];
  dueDate?: string | null;
  done: boolean;
  version: number; // optimistic lock, sent back on move (BUG-005)
  createdAt: string;
}

export interface CardEvent {
  id: string;
  cardId: string;
  type: "created" | "moved" | "field_updated" | "commented";
  fromPhaseId?: string | null;
  toPhaseId?: string | null;
  actorId?: string | null;
  text?: string;
  createdAt: string;
}
