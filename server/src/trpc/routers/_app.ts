import { router } from "../trpc.js";
import { userRouter } from "./user.js";
import { pipeRouter } from "./pipe.js";
import { phaseRouter } from "./phase.js";
import { fieldRouter } from "./field.js";
import { cardRouter } from "./card.js";
import { eventRouter } from "./event.js";
import { labelRouter } from "./label.js";
import { commentRouter } from "./comment.js";
import { checklistRouter } from "./checklist.js";
import { conditionRouter } from "./condition.js";
import { databaseRouter } from "./database.js";
import { connectionRouter } from "./connection.js";
import { automationRouter } from "./automation.js";
import { calendarRouter } from "./calendar.js";
import { notificationRouter } from "./notification.js";
import { publicFormRouter } from "./publicForm.js";
import { outsideRouter } from "./outside.js";
import { emailRouter } from "./email.js";
import { dashboardRouter } from "./dashboard.js";
import { biRouter } from "./bi.js";
import { peopleRouter } from "./people.js";
import { orgRouter } from "./org.js";

export const appRouter = router({
  user: userRouter,
  pipe: pipeRouter,
  phase: phaseRouter,
  field: fieldRouter,
  card: cardRouter,
  event: eventRouter,
  label: labelRouter,
  comment: commentRouter,
  checklist: checklistRouter,
  condition: conditionRouter,
  database: databaseRouter,
  connection: connectionRouter,
  automation: automationRouter,
  calendar: calendarRouter,
  notification: notificationRouter,
  publicForm: publicFormRouter,
  outside: outsideRouter,
  email: emailRouter,
  dashboard: dashboardRouter,
  bi: biRouter,
  people: peopleRouter,
  org: orgRouter,
});

// The front-end imports this type for an end-to-end-typed client.
export type AppRouter = typeof appRouter;
