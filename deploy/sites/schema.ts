import {sqliteTable,text,integer,index} from "drizzle-orm/sqlite-core";
export const publications=sqliteTable("publications",{
 id:text("id").primaryKey(),owner:text("owner").notNull(),revision:integer("revision").notNull(),updatedAt:text("updated_at").notNull(),payload:text("payload").notNull()
},t=>[index("publications_owner_updated").on(t.owner,t.updatedAt)]);
