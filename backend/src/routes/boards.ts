import { Router } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import { listBoards, getBoard, createBoard, deleteBoard } from "../lib/boardStore.js";

export interface Board {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export const boardsRouter = Router();

// GET /api/boards
boardsRouter.get("/boards", requireIdentity(), async (req, res, next) => {
  try {
    const boards = await listBoards(req.identity.email);
    res.json(boards);
  } catch (err) {
    next(err);
  }
});

// POST /api/boards
boardsRouter.post("/boards", requireIdentity(), async (req, res, next) => {
  try {
    const { name } = req.body as { name?: unknown };
    if (typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "validation_error", message: "name is required." });
      return;
    }
    const board = await createBoard(req.identity.email, name.trim());
    res.status(201).json(board);
  } catch (err) {
    next(err);
  }
});

// GET /api/boards/:id
boardsRouter.get("/boards/:id", requireIdentity(), async (req, res, next) => {
  try {
    const board = await getBoard(req.params.id as string, req.identity.email);
    if (!board) {
      res.status(404).json({ error: "not_found", message: "Board not found." });
      return;
    }
    res.json(board);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/boards/:id
boardsRouter.delete("/boards/:id", requireIdentity(), async (req, res, next) => {
  try {
    await deleteBoard(req.params.id as string, req.identity.email);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
