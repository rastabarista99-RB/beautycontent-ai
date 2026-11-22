"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const state = {};

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  module._compile(outputText, filename);
};

class RedirectSignal extends Error {
  constructor(destination) {
    super(`Redirect to ${destination}`);
    this.destination = destination;
  }
}

const auth = {
  async signUp(input) {
    state.signUpCalls.push(input);
    return state.signUpResult;
  },
  async signInWithPassword(input) {
    state.signInCalls.push(input);
    return state.signInResult;
  },
  async signOut() {
    state.signOutCalls += 1;
    return state.signOutResult;
  },
  async verifyOtp(input) {
    state.verifyOtpCalls.push(input);
    return state.verifyOtpHandler(input);
  },
};

const supabase = { auth };
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  if (request === "@/lib/supabase/server") {
    return {
      createClient: async () => {
        state.createClientCalls += 1;
        return supabase;
      },
    };
  }
  if (request === "next/headers") {
    return {
      headers: async () => new Headers(state.origin ? { origin: state.origin } : {}),
    };
  }
  if (request === "next/cache") {
    return {
      revalidatePath(...args) {
        state.revalidatedPaths.push(args);
      },
    };
  }
  if (request === "next/navigation") {
    return {
      redirect(destination) {
        throw new RedirectSignal(destination);
      },
    };
  }
  if (request === "next/server") {
    return {
      NextResponse: {
        redirect(destination) {
          return new Response(null, {
            status: 307,
            headers: { location: String(destination) },
          });
        },
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { signIn, signOut, signUp } = require(path.join(root, "lib", "auth", "actions.ts"));
const { GET } = require(path.join(root, "app", "auth", "confirm", "route.ts"));

test.beforeEach(() => {
  Object.assign(state, {
    createClientCalls: 0,
    origin: "https://beautycontent.example",
    revalidatedPaths: [],
    signInCalls: [],
    signInResult: { error: null },
    signOutCalls: 0,
    signOutResult: { error: null },
    signUpCalls: [],
    signUpResult: { error: null },
    verifyOtpCalls: [],
    verifyOtpHandler: async () => ({ error: null }),
  });
});

function form(values) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) {
    data.set(name, value);
  }
  return data;
}

async function assertRedirect(promise, destination) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof RedirectSignal);
    assert.equal(error.destination, destination);
    return true;
  });
}

test("rejects invalid registration inputs before calling Supabase", async () => {
  const cases = [
    [{ email: "not-an-email", password: "secret1", confirmPassword: "secret1" }, "valid email"],
    [{ email: "user@example.com", password: "short", confirmPassword: "short" }, "at least 6"],
    [{ email: "user@example.com", password: "secret1", confirmPassword: "different" }, "do not match"],
  ];

  for (const [values, expectedMessage] of cases) {
    const result = await signUp({}, form(values));
    assert.match(result.error, new RegExp(expectedMessage, "i"));
  }

  assert.equal(state.createClientCalls, 0);
  assert.equal(state.signUpCalls.length, 0);
});

test("registers successfully with normalized email and the confirmation callback URL", async () => {
  const result = await signUp({}, form({
    email: "  User@Example.com ",
    password: "secret1",
    confirmPassword: "secret1",
  }));

  assert.deepEqual(result, { success: true });
  assert.deepEqual(state.signUpCalls, [{
    email: "user@example.com",
    password: "secret1",
    options: { emailRedirectTo: "https://beautycontent.example/auth/confirm" },
  }]);
});

test("registration omits the confirmation URL when the request has no Origin", async () => {
  state.origin = "";

  const result = await signUp({}, form({
    email: "user@example.com",
    password: "secret1",
    confirmPassword: "secret1",
  }));

  assert.deepEqual(result, { success: true });
  assert.deepEqual(state.signUpCalls[0], {
    email: "user@example.com",
    password: "secret1",
    options: undefined,
  });
});

test("returns a generic registration message for Supabase signup errors", async () => {
  state.signUpResult = { error: { message: "provider unavailable" } };

  const result = await signUp({}, form({
    email: "user@example.com",
    password: "secret1",
    confirmPassword: "secret1",
  }));

  assert.deepEqual(result, { error: "We could not complete that request. Please try again." });
});

test("maps an existing-email signup error to the account-exists response", async () => {
  state.signUpResult = { error: { message: "User already registered" } };

  const result = await signUp({}, form({
    email: "user@example.com",
    password: "secret1",
    confirmPassword: "secret1",
  }));

  assert.deepEqual(result, {
    error: "An account with this email already exists. Try signing in.",
  });
});

test("processes repeated registration submissions as separate Supabase requests", async () => {
  const registration = form({
    email: "user@example.com",
    password: "secret1",
    confirmPassword: "secret1",
  });

  assert.deepEqual(await signUp({}, registration), { success: true });
  assert.deepEqual(await signUp({}, registration), { success: true });
  assert.equal(state.signUpCalls.length, 2);
});

test("rejects invalid login input before calling Supabase", async () => {
  const invalidEmail = await signIn({}, form({ email: "invalid", password: "secret1" }));
  const missingPassword = await signIn({}, form({ email: "user@example.com", password: "" }));

  assert.deepEqual(invalidEmail, { error: "Enter a valid email address and password." });
  assert.deepEqual(missingPassword, { error: "Enter a valid email address and password." });
  assert.equal(state.createClientCalls, 0);
  assert.equal(state.signInCalls.length, 0);
});

test("logs in with normalized email, revalidates the layout, and redirects to dashboard", async () => {
  await assertRedirect(signIn({}, form({
    email: "  User@Example.com ",
    password: "secret1",
  })), "/dashboard");

  assert.deepEqual(state.signInCalls, [{ email: "user@example.com", password: "secret1" }]);
  assert.deepEqual(state.revalidatedPaths, [["/", "layout"]]);
});

test("maps invalid credentials to a safe response", async () => {
  state.signInResult = { error: { message: "Invalid login credentials", status: 400 } };

  const result = await signIn({}, form({ email: "user@example.com", password: "incorrect" }));

  assert.deepEqual(result, { error: "The email or password is incorrect." });
});

test("maps an unconfirmed email error to the confirmation response", async () => {
  state.signInResult = { error: { message: "Email not confirmed", status: 400 } };

  const result = await signIn({}, form({ email: "user@example.com", password: "secret1" }));

  assert.deepEqual(result, { error: "Please confirm your email before signing in." });
});

test("uses a generic login response for unexpected Supabase errors", async () => {
  state.signInResult = { error: { message: "database details", status: 500 } };

  const result = await signIn({}, form({ email: "user@example.com", password: "secret1" }));

  assert.deepEqual(result, { error: "We could not complete that request. Please try again." });
});

test("processes repeated login submissions as separate Supabase requests", async () => {
  const credentials = form({ email: "user@example.com", password: "secret1" });

  await assertRedirect(signIn({}, credentials), "/dashboard");
  await assertRedirect(signIn({}, credentials), "/dashboard");
  assert.equal(state.signInCalls.length, 2);
});

test("logs out successfully, revalidates the layout, and redirects to login", async () => {
  await assertRedirect(signOut(), "/login");

  assert.equal(state.signOutCalls, 1);
  assert.deepEqual(state.revalidatedPaths, [["/", "layout"]]);
});

test("surfaces logout failure without revalidation or redirect", async () => {
  state.signOutResult = { error: { message: "logout failed" } };

  await assert.rejects(signOut(), { message: "Unable to sign out." });

  assert.equal(state.signOutCalls, 1);
  assert.deepEqual(state.revalidatedPaths, []);
});

test("processes repeated logout submissions as separate Supabase requests", async () => {
  await assertRedirect(signOut(), "/login");
  await assertRedirect(signOut(), "/login");

  assert.equal(state.signOutCalls, 2);
  assert.deepEqual(state.revalidatedPaths, [["/", "layout"], ["/", "layout"]]);
});

test("confirmation rejects missing parameters and unsupported token types", async (t) => {
  const cases = [
    ["missing token hash", "https://beautycontent.example/auth/confirm?type=signup"],
    ["missing type", "https://beautycontent.example/auth/confirm?token_hash=valid-token"],
    ["unsupported type", "https://beautycontent.example/auth/confirm?token_hash=valid-token&type=unsupported"],
  ];

  for (const [name, url] of cases) {
    await t.test(name, async () => {
      const response = await GET(new Request(url));

      assert.equal(response.status, 307);
      assert.equal(
        response.headers.get("location"),
        "https://beautycontent.example/error?reason=confirmation",
      );
    });
  }

  assert.equal(state.createClientCalls, 0);
  assert.equal(state.verifyOtpCalls.length, 0);
});

test("confirmation verifies an allowed token and redirects to dashboard", async () => {
  const response = await GET(new Request(
    "https://beautycontent.example/auth/confirm?token_hash=valid-token&type=signup&next=https%3A%2F%2Fevil.example",
  ));

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://beautycontent.example/dashboard");
  assert.deepEqual(state.verifyOtpCalls, [{ type: "signup", token_hash: "valid-token" }]);
});

test("confirmation maps a failed OTP verification to the fixed error destination", async () => {
  state.verifyOtpHandler = async () => ({ error: { message: "expired token details" } });

  const response = await GET(new Request(
    "https://beautycontent.example/auth/confirm?token_hash=expired-token&type=recovery",
  ));

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://beautycontent.example/error?reason=confirmation",
  );
  assert.deepEqual(state.verifyOtpCalls, [{ type: "recovery", token_hash: "expired-token" }]);
});

test("repeated confirmation callbacks are verified independently", async () => {
  let attempts = 0;
  state.verifyOtpHandler = async () => {
    attempts += 1;
    return attempts === 1 ? { error: null } : { error: { message: "already used" } };
  };
  const request = new Request(
    "https://beautycontent.example/auth/confirm?token_hash=one-time-token&type=signup",
  );

  const firstResponse = await GET(request.clone());
  const secondResponse = await GET(request.clone());

  assert.equal(firstResponse.headers.get("location"), "https://beautycontent.example/dashboard");
  assert.equal(
    secondResponse.headers.get("location"),
    "https://beautycontent.example/error?reason=confirmation",
  );
  assert.equal(state.verifyOtpCalls.length, 2);
});
