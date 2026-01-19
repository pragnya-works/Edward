import { pgTable, text, timestamp, boolean, foreignKey, unique, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const roleEnum = pgEnum("role", ["viewer", "editor", "owner"]);
export const inviteStatusEnum = pgEnum("invite_status", ["pending", "accepted", "rejected"]);
export const attachmentTypeEnum = pgEnum("attachment_type", ["image", "pdf", "figma"]);
export const messageRoleEnum = pgEnum("message_role", ["system", "user", "assistant", "data"]);

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
	image: text("image"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date())
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" })
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date())
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date())
});

export const chat = pgTable("chat", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
	title: text("title"),
	description: text("description"),
	visibility: boolean("visibility").default(false),
	sourceCodePath: text("source_code_path"),
	previewLink: text("preview_link"),
	githubRepoId: text("github_repo_id"),
	isFavourite: boolean("is_favourite").default(false),
	originalChatId: text("original_chat_id"),
	rootChatId: text("root_chat_id"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date())
}, (table) => [
	foreignKey({
		columns: [table.originalChatId],
		foreignColumns: [table.id],
		name: "chat_original_chat_id_fk"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.rootChatId],
		foreignColumns: [table.id],
		name: "chat_root_chat_id_fk"
	}).onDelete("set null")
]);

export const chatCollaborator = pgTable("chat_collaborator", {
	id: text("id").primaryKey(),
	chatId: text("chat_id").notNull().references(() => chat.id, { onDelete: "cascade" }),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
	role: roleEnum("role").notNull().default("viewer"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date())
}, (table) => [
	unique("chat_collaborator_chat_id_user_id_unique").on(table.chatId, table.userId)
]);

export const chatInvite = pgTable("chat_invite", {
	id: text("id").primaryKey(),
	chatId: text("chat_id").notNull().references(() => chat.id, { onDelete: "cascade" }),
	email: text("email").notNull(),
	role: roleEnum("role").notNull().default("viewer"),
	inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
	status: inviteStatusEnum("status").notNull().default("pending"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date())
}, (table) => [
	unique("chat_invite_chat_id_email_unique").on(table.chatId, table.email)
]);

export const message = pgTable("message", {
	id: text("id").primaryKey(),
	chatId: text("chat_id").notNull().references(() => chat.id, { onDelete: "cascade" }),
	role: messageRoleEnum("role").notNull().default("user"),
	content: text("content"),
	userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date())
});

export const attachment = pgTable("attachment", {
	id: text("id").primaryKey(),
	messageId: text("message_id").notNull().references(() => message.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	url: text("url").notNull(),
	type: attachmentTypeEnum("type").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date())
});

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	chats: many(chat),
	collaborations: many(chatCollaborator),
	messages: many(message),
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
		relationName: "chat_copies"
	}),
	copies: many(chat, {
		relationName: "chat_copies"
	}),
	rootChat: one(chat, {
		fields: [chat.rootChatId],
		references: [chat.id],
		relationName: "chat_root"
	}),
	familyMembers: many(chat, {
		relationName: "chat_root"
	}),
	collaborators: many(chatCollaborator),
	invites: many(chatInvite),
	messages: many(message),
}));

export const chatCollaboratorRelations = relations(chatCollaborator, ({ one }) => ({
	chat: one(chat, {
		fields: [chatCollaborator.chatId],
		references: [chat.id],
	}),
	user: one(user, {
		fields: [chatCollaborator.userId],
		references: [user.id],
	}),
}));

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
}));

export const attachmentRelations = relations(attachment, ({ one }) => ({
	message: one(message, {
		fields: [attachment.messageId],
		references: [message.id],
	}),
}));