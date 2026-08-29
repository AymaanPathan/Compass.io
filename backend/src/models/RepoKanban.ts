import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * Fixed set of kanban columns. Not user-configurable — the frontend renders
 * exactly these three columns in this order.
 */
export type KanbanStatus = "selected" | "in_progress" | "contributed";

export const KANBAN_STATUSES: KanbanStatus[] = [
  "selected",
  "in_progress",
  "contributed",
];

export interface IKanbanItem extends Document {
  userId: Types.ObjectId;
  name: string;
  url: string;
  description: string;
  repoType: string;
  whyItMatches: string;
  status: KanbanStatus;
  createdAt: Date;
  updatedAt: Date;
}

const KanbanItemSchema = new Schema<IKanbanItem>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    url: { type: String, required: true },
    description: { type: String, default: "" },
    repoType: { type: String, default: "" },
    whyItMatches: { type: String, default: "" },
    status: {
      type: String,
      enum: KANBAN_STATUSES,
      default: "selected",
      required: true,
    },
  },
  { timestamps: true },
);

// One card per repo per user — re-adding the same repo just moves/updates it
// instead of creating a duplicate card.
KanbanItemSchema.index({ userId: 1, url: 1 }, { unique: true });

export default mongoose.model<IKanbanItem>("KanbanItem", KanbanItemSchema);
