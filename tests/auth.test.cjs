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

const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }
  if (request === "@/lib/db/prisma") {
    return {
      prisma: {
        user: {
          async findUnique(args) {
            state.findUniqueCalls.push(args);
            if (state.findUniqueError) throw state.findUniqueError;
            return state.existingUser;
          },
          async create(args) {
            state.createCalls.push(args);
            if (state.createError) throw state.createError;
            return state.createdUser;
          },
        },
      },
    };
  }
  if (request === "@/lib/auth/session") {
    return {
      async setSessionCookie(user) {
        state.sessionCookieUsers.push(user);
        if (state.setCookieError) throw state.setCookieError;
      },
      async clearSessionCookie() {
        state.clearCookieCalls += 1;
      },
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
  if (request.startsWith("@/")) {
    const modulePath = path.join(root, request.slice(2));
    return originalLoad(`${modulePath}.ts`, parent, isMain);
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { signIn, signOut, signUp } = require(path.join(root, "lib", "auth", "actions.ts"));
const { hashPassword, verifyPassword } = require(path.join(root, "lib", "auth", "password.ts"));
const { signSessionToken, verifySessionToken } = require(path.join(root, "lib", "auth", "session-token.ts"));

test.beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-with-at-least-32-characters";
  Object.assign(state, {
    findUniqueCalls: [],
    findUniqueError: null,
    existingUser: null,
    createCalls: [],
    createError: null,
    createdUser: { id: "user-1", email: "user@example.com" },
    sessionCookieUsers: [],
    setCookieError: null,
    clearCookieCalls: 0,
    revalidatedPaths: [],
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

test("hashes and verifies passwords safely with scrypt", async () => {
  const hash = await hashPassword("secret123");
  assert.match(hash, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.equal(await verifyPassword("secret123", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
  assert.equal(await verifyPassword("secret123", "malformed-hash"), false);
});

test("signs and verifies HMAC session tokens and rejects tampered or expired tokens", async () => {
  const token = await signSessionToken({ userId: "user-1", email: "user@example.com" });
  const verified = await verifySessionToken(token);
  assert.equal(verified.sub, "user-1");
  assert.equal(verified.email, "user@example.com");
  assert.ok(verified.exp > Math.floor(Date.now() / 1000));

  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  assert.equal(await verifySessionToken(tampered), null);
  assert.equal(await verifySessionToken(undefined), null);

  process.env.AUTH_SECRET = "short";
  assert.equal(await verifySessionToken(token), null);
});

test("rejects invalid registration inputs before querying Postgres", async () => {
  const cases = [
    [{ email: "not-an-email", password: "secret1", confirmPassword: "secret1" }, "valid email"],
    [{ email: "user@example.com", password: "short", confirmPassword: "short" }, "at least 6"],
    [{ email: "user@example.com", password: "secret1", confirmPassword: "different" }, "do not match"],
  ];

  for (const [values, expectedMessage] of cases) {
    const result = await signUp({}, form(values));
    assert.match(result.error, new RegExp(expectedMessage, "i"));
  }

  assert.equal(state.findUniqueCalls.length, 0);
  assert.equal(state.createCalls.length, 0);
});

test("registers successfully with normalized email, hashes password, sets session cookie, and redirects", async () => {
  await assertRedirect(signUp({}, form({
    email: "  User@Example.com ",
    password: "secret1",
    confirmPassword: "secret1",
  })), "/dashboard");

  assert.equal(state.findUniqueCalls[0].where.email, "user@example.com");
  assert.equal(state.createCalls[0].data.email, "user@example.com");
  assert.match(state.createCalls[0].data.passwordHash, /^scrypt\$/);
  assert.deepEqual(state.sessionCookieUsers, [{ id: "user-1", email: "user@example.com" }]);
  assert.deepEqual(state.revalidatedPaths, [["/", "layout"]]);
});

test("maps existing-email and Prisma P2002 errors to the account-exists response", async () => {
  state.existingUser = { id: "existing-id" };
  let result = await signUp({}, form({
    email: "user@example.com",
    password: "secret1",
    confirmPassword: "secret1",
  }));
  assert.deepEqual(result, {
    error: "An account with this email already exists. Try signing in.",
  });

  state.existingUser = null;
  state.createError = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  result = await signUp({}, form({
    email: "user@example.com",
    password: "secret1",
    confirmPassword: "secret1",
  }));
  assert.deepEqual(result, {
    error: "An account with this email already exists. Try signing in.",
  });
});

test("returns a generic registration message for unexpected database errors", async () => {
  state.createError = new Error("connection refused");
  const result = await signUp({}, form({
    email: "user@example.com",
    password: "secret1",
    confirmPassword: "secret1",
  }));
  assert.deepEqual(result, { error: "We could not complete that request. Please try again." });
});

test("rejects invalid login input before querying Postgres", async () => {
  const invalidEmail = await signIn({}, form({ email: "invalid", password: "secret1" }));
  const missingPassword = await signIn({}, form({ email: "user@example.com", password: "" }));

  assert.deepEqual(invalidEmail, { error: "Enter a valid email address and password." });
  assert.deepEqual(missingPassword, { error: "Enter a valid email address and password." });
  assert.equal(state.findUniqueCalls.length, 0);
});

test("logs in with normalized email, verifies password, sets cookie, and redirects to dashboard", async () => {
  state.existingUser = {
    id: "user-1",
    email: "user@example.com",
    passwordHash: await hashPassword("secret1"),
  };

  await assertRedirect(signIn({}, form({
    email: "  User@Example.com ",
    password: "secret1",
  })), "/dashboard");

  assert.equal(state.findUniqueCalls[0].where.email, "user@example.com");
  assert.deepEqual(state.sessionCookieUsers, [{ id: "user-1", email: "user@example.com" }]);
  assert.deepEqual(state.revalidatedPaths, [["/", "layout"]]);
});

test("maps unknown users and wrong passwords to invalid credentials response", async () => {
  let result = await signIn({}, form({ email: "user@example.com", password: "incorrect" }));
  assert.deepEqual(result, { error: "The email or password is incorrect." });

  state.existingUser = {
    id: "user-1",
    email: "user@example.com",
    passwordHash: await hashPassword("correct-password"),
  };
  result = await signIn({}, form({ email: "user@example.com", password: "incorrect" }));
  assert.deepEqual(result, { error: "The email or password is incorrect." });
});

test("uses a generic login response for unexpected database errors", async () => {
  state.findUniqueError = new Error("database details");
  const result = await signIn({}, form({ email: "user@example.com", password: "secret1" }));
  assert.deepEqual(result, { error: "We could not complete that request. Please try again." });
});

test("logs out by clearing the session cookie, revalidating layout, and redirecting to login", async () => {
  await assertRedirect(signOut(), "/login");
  assert.equal(state.clearCookieCalls, 1);
  assert.deepEqual(state.revalidatedPaths, [["/", "layout"]]);
});
