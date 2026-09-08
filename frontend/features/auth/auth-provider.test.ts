import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "../../config/app.config";
import { ApiError } from "../../lib/api/api-error";
import { AuthProvider, useAuth } from "./auth-provider";
import { authService } from "./auth.service";
import type { AuthUser } from "./auth.types";

// ใช้ config แยกสำหรับ test ไม่ขึ้นกับค่าในโครงการจริง
vi.mock("../../config/app.config", () => ({
  appConfig: {
    auth: {
      enabled: true,
    },
  },
}));

// ทดสอบ Provider จริง โดยจำลองเฉพาะ service ที่เรียก API
vi.mock("./auth.service", () => ({
  authService: {
    me: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

const meMock = vi.mocked(authService.me);
const loginMock = vi.mocked(authService.login);
const logoutMock = vi.mocked(authService.logout);

const user: AuthUser = {
  id: "1",
  username: "demo",
  displayName: "Demo User",
  roles: ["ADMIN"],
  permissions: ["REPORT_VIEW"],
};

function renderAuth() {
  return renderHook(() => useAuth(), {
    wrapper: AuthProvider,
  });
}

// ใช้ควบคุมว่า response จะกลับมาตอนไหน
function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

beforeEach(() => {
  appConfig.auth.enabled = true;

  meMock.mockReset();
  loginMock.mockReset();
  logoutMock.mockReset();

  loginMock.mockResolvedValue(user);
  logoutMock.mockResolvedValue(undefined);
});

describe("AuthProvider", () => {
  it("ปิด auth แล้วไม่เรียกตรวจ session", () => {
    appConfig.auth.enabled = false;

    const { result } = renderAuth();

    expect(result.current.session).toEqual({
      status: "disabled",
      user: null,
    });

    expect(meMock).not.toHaveBeenCalled();
  });

  it("โหลดข้อมูลผู้ใช้จาก session สำเร็จ", async () => {
    meMock.mockResolvedValueOnce(user);

    const { result } = renderAuth();

    expect(result.current.session.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.session).toEqual({
        status: "authenticated",
        user,
      });
    });
  });

  it.each([
    { httpStatus: 401, expectedStatus: "unauthenticated" },
    { httpStatus: 500, expectedStatus: "error" },
  ])(
    "HTTP $httpStatus ทำให้สถานะเป็น $expectedStatus",
    async ({ httpStatus, expectedStatus }) => {
      meMock.mockRejectedValueOnce(
        new ApiError("Session request failed", httpStatus),
      );

      const { result } = renderAuth();

      await waitFor(() => {
        expect(result.current.session.status).toBe(expectedStatus);
      });

      expect(result.current.session.user).toBeNull();
    },
  );

  it("ลองตรวจ session ใหม่ได้หลังเชื่อมต่อล้มเหลว", async () => {
    meMock
      .mockRejectedValueOnce(new ApiError("Network error", 0))
      .mockResolvedValueOnce(user);

    const { result } = renderAuth();

    await waitFor(() => {
      expect(result.current.session.status).toBe("error");
    });

    act(() => {
      result.current.retrySession();
    });

    await waitFor(() => {
      expect(result.current.session).toEqual({
        status: "authenticated",
        user,
      });
    });

    expect(meMock).toHaveBeenCalledTimes(2);
  });

  it("login แล้วเก็บผู้ใช้ และ logout สำเร็จแล้วล้างผู้ใช้", async () => {
    meMock.mockRejectedValueOnce(new ApiError("Unauthorized", 401));

    const { result } = renderAuth();

    await waitFor(() => {
      expect(result.current.session.status).toBe("unauthenticated");
    });

    const input = {
      username: "demo",
      password: "test-password",
    };

    await act(async () => {
      await result.current.login(input);
    });

    expect(loginMock).toHaveBeenCalledWith(input);
    expect(result.current.session).toEqual({
      status: "authenticated",
      user,
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(result.current.session).toEqual({
      status: "unauthenticated",
      user: null,
    });
  });

  it("ไม่แสดงว่า logout สำเร็จ หาก backend ยกเลิก session ไม่สำเร็จ", async () => {
    meMock.mockResolvedValueOnce(user);

    const failure = new ApiError("Logout failed", 500);
    logoutMock.mockRejectedValueOnce(failure);

    const { result } = renderAuth();

    await waitFor(() => {
      expect(result.current.session.status).toBe("authenticated");
    });

    await act(async () => {
      await expect(result.current.logout()).rejects.toBe(failure);
    });

    expect(result.current.session).toEqual({
      status: "authenticated",
      user,
    });
  });

  it("response ตรวจ session เก่าไม่ทำให้กลับมา login หลัง logout", async () => {
    const pendingSession = deferred<AuthUser>();
    meMock.mockReturnValueOnce(pendingSession.promise);

    const { result } = renderAuth();

    expect(result.current.session.status).toBe("loading");

    // ระหว่าง request /me เก่ายังค้างอยู่ มีการเปลี่ยน session
    await act(async () => {
      await result.current.login({
        username: "demo",
        password: "test-password",
      });
    });

    await act(async () => {
      await result.current.logout();
    });

    // response เก่าเพิ่งกลับมาหลัง logout
    await act(async () => {
      pendingSession.resolve(user);
      await pendingSession.promise;
    });

    expect(result.current.session).toEqual({
      status: "unauthenticated",
      user: null,
    });
  });
});