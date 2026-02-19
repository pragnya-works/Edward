import {
  pgTable,
  text,
  timestamp,
  boolean,
  foreignKey,
  unique,
  pgEnum,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { Model } from "@edward/shared/schema";

export const roleEnum = pgEnum("role", ["viewer", "editor", "owner"]);
export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "rejected",
]);
export const attachmentTypeEnum = pgEnum("attachment_type", [
  "image",
  "pdf",
  "figma",
]);
export const messageRoleEnum = pgEnum("message_role", [
  "system",
  "user",
  "assistant",
  "data",
]);
export const buildStatusEnum = pgEnum("build_status", [
  "queued",
  "building",
  "success",
  "failed",
]);
export const runStatusEnum = pgEnum("run_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export const runStateEnum = pgEnum("run_state", [
  "INIT",
  "LLM_STREAM",
  "TOOL_EXEC",
  "APPLY",
  "NEXT_TURN",
  "COMPLETE",
  "FAILED",
  "CANCELLED",
]);

export enum MessageRole {
  System = "system",
  User = "user",
  Assistant = "assistant",
  Data = "data",
}

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  apiKey: text("api_key"),
  preferredModel: text("preferred_model")
    .notNull()
    .default(Model.GEMINI_2_5_FLASH),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const chat = pgTable(
  "chat",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    description: text("description"),
    visibility: boolean("visibility").default(false),
    githubRepoId: text("github_repo_id"),
    githubRepoFullName: text("github_repo_full_name"),
    isFavourite: boolean("is_favourite").default(false),
    originalChatId: text("original_chat_id"),
    rootChatId: text("root_chat_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.originalChatId],
      foreignColumns: [table.id],
      name: "chat_original_chat_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.rootChatId],
      foreignColumns: [table.id],
      name: "chat_root_chat_id_fk",
    }).onDelete("set null"),
  ],
);

export const chatCollaborator = pgTable(
  "chat_collaborator",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("chat_collaborator_chat_id_user_id_unique").on(
      table.chatId,
      table.userId,
    ),
  ],
);

export const chatInvite = pgTable(
  "chat_invite",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull().default("viewer"),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: inviteStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("chat_invite_chat_id_email_unique").on(table.chatId, table.email),
  ],
);

export const message = pgTable("message", {
  id: text("id").primaryKey(),
  chatId: text("chat_id")
    .notNull()
    .references(() => chat.id, { onDelete: "cascade" }),
  role: messageRoleEnum("role").notNull().default("user"),
  content: text("content"),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  completionTime: integer("completion_time"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
});

export const build = pgTable("build", {
  id: text("id").primaryKey(),
  chatId: text("chat_id")
    .notNull()
    .references(() => chat.id, { onDelete: "cascade" }),
  messageId: text("message_id")
    .notNull()
    .references(() => message.id, { onDelete: "cascade" }),
  status: buildStatusEnum("status").notNull().default("queued"),
  errorReport: jsonb("error_report"),
  previewUrl: text("preview_url"),
  buildDuration: integer("build_duration"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const run = pgTable(
  "run",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userMessageId: text("user_message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    assistantMessageId: text("assistant_message_id").notNull(),
    status: runStatusEnum("status").notNull().default("queued"),
    state: runStateEnum("state").notNull().default("INIT"),
    currentTurn: integer("current_turn").notNull().default(0),
    nextEventSeq: integer("next_event_seq").notNull().default(0),
    model: text("model"),
    intent: text("intent"),
    loopStopReason: text("loop_stop_reason"),
    terminationReason: text("termination_reason"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_run_chat_id").on(table.chatId),
    index("idx_run_user_id").on(table.userId),
    index("idx_run_status").on(table.status),
  ],
);

export const runEvent = pgTable(
  "run_event",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => run.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    eventType: text("event_type").notNull(),
    event: jsonb("event").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("run_event_run_id_seq_unique").on(table.runId, table.seq),
    index("idx_run_event_run_id_seq").on(table.runId, table.seq),
  ],
);

export const runToolCall = pgTable(
  "run_tool_call",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => run.id, { onDelete: "cascade" }),
    turn: integer("turn").notNull().default(0),
    toolName: text("tool_name").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    input: jsonb("input").notNull(),
    output: jsonb("output"),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("run_tool_call_run_id_idempotency_key_unique").on(
      table.runId,
      table.idempotencyKey,
    ),
    index("idx_run_tool_call_run_id").on(table.runId),
  ],
);

export const attachment = pgTable("attachment", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => message.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  type: attachmentTypeEnum("type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  chats: many(chat),
  collaborations: many(chatCollaborator),
  messages: many(message),
  runs: many(run),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const chatRelations = relations(chat, ({ one, many }) => ({
  user: one(user, {
    fields: [chat.userId],
    references: [user.id],
  }),
  originalChat: one(chat, {
    fields: [chat.originalChatId],
    references: [chat.id],
    relationName: "chat_copies",
  }),
  copies: many(chat, {
    relationName: "chat_copies",
  }),
  rootChat: one(chat, {
    fields: [chat.rootChatId],
    references: [chat.id],
    relationName: "chat_root",
  }),
  familyMembers: many(chat, {
    relationName: "chat_root",
  }),
  collaborators: many(chatCollaborator),
  invites: many(chatInvite),
  messages: many(message),
  builds: many(build),
  runs: many(run),
}));

export const chatCollaboratorRelations = relations(
  chatCollaborator,
  ({ one }) => ({
    chat: one(chat, {
      fields: [chatCollaborator.chatId],
      references: [chat.id],
    }),
    user: one(user, {
      fields: [chatCollaborator.userId],
      references: [user.id],
    }),
  }),
);

export const chatInviteRelations = relations(chatInvite, ({ one }) => ({
  chat: one(chat, {
    fields: [chatInvite.chatId],
    references: [chat.id],
  }),
  inviter: one(user, {
    fields: [chatInvite.inviterId],
    references: [user.id],
  }),
}));

export const messageRelations = relations(message, ({ one, many }) => ({
  chat: one(chat, {
    fields: [message.chatId],
    references: [chat.id],
  }),
  user: one(user, {
    fields: [message.userId],
    references: [user.id],
  }),
  attachments: many(attachment),
  builds: many(build),
}));

export const attachmentRelations = relations(attachment, ({ one }) => ({
  message: one(message, {
    fields: [attachment.messageId],
    references: [message.id],
  }),
}));

export const buildRelations = relations(build, ({ one }) => ({
  chat: one(chat, {
    fields: [build.chatId],
    references: [chat.id],
  }),
  message: one(message, {
    fields: [build.messageId],
    references: [message.id],
  }),
}));

export const runRelations = relations(run, ({ one, many }) => ({
  chat: one(chat, {
    fields: [run.chatId],
    references: [chat.id],
  }),
  user: one(user, {
    fields: [run.userId],
    references: [user.id],
  }),
  userMessage: one(message, {
    fields: [run.userMessageId],
    references: [message.id],
    relationName: "run_user_message",
  }),
  events: many(runEvent),
  toolCalls: many(runToolCall),
}));

export const runEventRelations = relations(runEvent, ({ one }) => ({
  run: one(run, {
    fields: [runEvent.runId],
    references: [run.id],
  }),
}));

export const runToolCallRelations = relations(runToolCall, ({ one }) => ({
  run: one(run, {
    fields: [runToolCall.runId],
    references: [run.id],
  }),
}));
