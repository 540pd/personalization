import { describe, expect, it } from "vitest";
import {
  createBoard,
  deleteBoard,
  getBoard,
  listBoards,
} from "../boardService.js";
import { createId } from "../../utils/id.js";

describe("boardService", () => {
  it("persists board operations through the board store", async () => {
    const userId = `board-service-test-${createId()}`;
    const board = await createBoard(userId, "Test board");

    expect(board).toMatchObject({
      userId,
      name: "Test board",
    });
    expect(await getBoard(board.id, userId)).toEqual(board);
    expect(await listBoards(userId)).toEqual([board]);
    expect(await getBoard(board.id, "another-user")).toBeNull();

    await deleteBoard(board.id, userId);
    expect(await getBoard(board.id, userId)).toBeNull();
  });
});
