import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const documents = sqliteTable('editorial_documents', {
  id: text('id').primaryKey(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  head: integer('head').notNull(),
  published: integer('published'),
});
export const revisions = sqliteTable('editorial_revisions', {
  documentId: text('document_id').notNull().references(() => documents.id),
  version: integer('version').notNull(),
  state: text('state').notNull(),
  content: text('content').notNull(),
  actor: text('actor').notNull(),
  role: text('role').notNull(),
  action: text('action').notNull(),
  note: text('note').notNull(),
  createdAt: text('created_at').notNull(),
}, table => [primaryKey({columns:[table.documentId,table.version]})]);
