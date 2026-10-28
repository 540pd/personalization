import { Router } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import { createBoard, deleteBoard, getBoard, listBoards } from "../services/boardService.js";
import { MAX_BOARD_BYTES, boardFileProblem, getCurrentBoard, saveCurrentBoard } from "../services/boardContentService.js";
import { sendValidationError } from "../common/errors.js";
import { isNonEmptyString } from "../common/validation.js";

export type { Board } from "../lib/boards/index.js";

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
    if (!isNonEmptyString(name)) {
      sendValidationError(res, "name is required.");
      return;
    }
    const board = await createBoard(req.identity.email, name.trim());
    res.status(201).json(board);
  } catch (err) {
    next(err);
  }
});

// GET /api/boards/current — the user's board (#324), made on first ask:
// { board, revision, updatedAt, content }, content null until first saved.
// Before /boards/:id, which would otherwise take "current" for an id.
boardsRouter.get("/boards/current", requireIdentity(), async (req, res, next) => {
  try {
    res.json(await getCurrentBoard(req.identity.email));
  } catch (err) {
    next(err);
  }
});

// PUT /api/boards/current — { revision, content }: saves the board if
// `revision` is still the latest; 409 with the latest if another save
// landed first (a second tab), 413 if it is too large to keep.
boardsRouter.put("/boards/current", requireIdentity(), async (req, res, next) => {
  try {
    const { revision, content } = (req.body ?? {}) as { revision?: unknown; content?: unknown };
    if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
      sendValidationError(res, "revision must be a whole number, 0 or more.");
      return;
    }
    const problem = boardFileProblem(content);
    if (problem) {
      sendValidationError(res, problem);
      return;
    }
    const result = await saveCurrentBoard(req.identity.email, content as object, revision);
    if (result.ok) {
      res.json({ revision: result.revision, updatedAt: result.updatedAt });
    } else if ("tooLarge" in result) {
      res.status(413).json({
        error: "too_large",
        message: `The board is ${Math.ceil(result.bytes / 1024)} KB; up to ${MAX_BOARD_BYTES / 1024} KB can be saved.`,
      });
    } else {
      res.status(409).json({ error: "conflict", message: "The board was saved elsewhere since.", revision: result.revision });
    }
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
