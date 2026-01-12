import { __reduceLobbyState } from "./MultiplayerScreen";

describe("MultiplayerScreen lobby reducer", () => {
  test("JOIN_REQUESTED transitions to searching and joinedQueue=true", () => {
    const next = __reduceLobbyState({ joinedQueue: false, queueState: "idle" }, { type: "JOIN_REQUESTED" });
    expect(next).toEqual({ joinedQueue: true, queueState: "searching" });
  });

  test("LEAVE_REQUESTED transitions back to idle and joinedQueue=false", () => {
    const next = __reduceLobbyState({ joinedQueue: true, queueState: "searching" }, { type: "LEAVE_REQUESTED" });
    expect(next).toEqual({ joinedQueue: false, queueState: "idle" });
  });

  test("MATCH_FOUND transitions to matched and joinedQueue=false", () => {
    const next = __reduceLobbyState({ joinedQueue: true, queueState: "searching" }, { type: "MATCH_FOUND" });
    expect(next).toEqual({ joinedQueue: false, queueState: "matched" });
  });

  test("RESET returns initial lobby state", () => {
    const next = __reduceLobbyState({ joinedQueue: true, queueState: "matched" }, { type: "RESET" });
    expect(next).toEqual({ joinedQueue: false, queueState: "idle" });
  });

  test("unknown action keeps state unchanged", () => {
    const prev = { joinedQueue: false, queueState: "idle" };
    const next = __reduceLobbyState(prev, { type: "SOMETHING_ELSE" });
    expect(next).toBe(prev);
  });
});
