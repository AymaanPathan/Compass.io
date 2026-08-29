import { Router, Response } from "express";
import KanbanItem, {
  KANBAN_STATUSES,
  KanbanStatus,
} from "../models/RepoKanban";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

function isValidStatus(value: unknown): value is KanbanStatus {
  return (
    typeof value === "string" && (KANBAN_STATUSES as string[]).includes(value)
  );
}

// All cards for the current user, flat + pre-grouped by column.
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const items = await KanbanItem.find({ userId: req.userId }).sort({
    updatedAt: -1,
  });

  const grouped: Record<KanbanStatus, typeof items> = {
    selected: [],
    in_progress: [],
    contributed: [],
  };
  for (const item of items) {
    grouped[item.status as KanbanStatus].push(item);
  }

  return res.json({ success: true, items, grouped });
});

// Add a repo to the board, or move it if it's already on the board
// (upserted on { userId, url }).
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const { name, url, description, repoType, whyItMatches, status } =
    req.body as {
      name?: string;
      url?: string;
      description?: string;
      repoType?: string;
      whyItMatches?: string;
      status?: string;
    };

  if (!name || !url) {
    return res
      .status(400)
      .json({ success: false, error: "name and url are required" });
  }
  if (!isValidStatus(status)) {
    return res.status(400).json({
      success: false,
      error: `status must be one of: ${KANBAN_STATUSES.join(", ")}`,
    });
  }

  try {
    const item = await KanbanItem.findOneAndUpdate(
      { userId: req.userId, url },
      {
        $set: {
          name,
          description: description ?? "",
          repoType: repoType ?? "",
          whyItMatches: whyItMatches ?? "",
          status,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.status(201).json({ success: true, item });
  } catch (error: any) {
    console.error("[kanban:add] ── ERROR ──", error?.message || error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to add repo to board" });
  }
});

// Move a card to a different column.
router.patch("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const { status } = req.body as { status?: string };
  if (!isValidStatus(status)) {
    return res.status(400).json({
      success: false,
      error: `status must be one of: ${KANBAN_STATUSES.join(", ")}`,
    });
  }

  const item = await KanbanItem.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $set: { status } },
    { new: true },
  );

  if (!item) {
    return res.status(404).json({ success: false, error: "Card not found" });
  }
  return res.json({ success: true, item });
});

// Remove a card from the board.
router.delete("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const result = await KanbanItem.deleteOne({
    _id: req.params.id,
    userId: req.userId,
  });
  if (result.deletedCount === 0) {
    return res.status(404).json({ success: false, error: "Card not found" });
  }
  return res.json({ success: true });
});

export default router;
