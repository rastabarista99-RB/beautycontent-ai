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

require.extensions[".tsx"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  module._compile(outputText, filename);
};

class MockQuery {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.action = "select";
    state.queries.push(this);
  }

  select(columns) {
    this.columns = columns;
    return this;
  }

  eq(column, value) {
    this.filters.push([column, value]);
    return this;
  }

  order() {
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  update(values) {
    this.action = "update";
    this.values = values;
    return this;
  }

  insert(values) {
    this.action = "insert";
    this.values = values;
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.result());
  }

  then(resolve, reject) {
    return Promise.resolve(this.result()).then(resolve, reject);
  }

  result() {
    if (this.table === "projects" && this.action === "select") {
      return { data: state.project, error: state.projectError };
    }
    if (this.table === "projects" && this.action === "update") {
      state.projectUpdate = this.values;
      state.projectUpdateFilters = this.filters;
      const revisionFilter = this.filters.find(([column]) => column === "updated_at");
      const revisionMatches = !revisionFilter || revisionFilter[1] === state.project?.updated_at;
      if (state.updateReturnsRow && revisionMatches && state.project && !state.updateError) {
        state.project = { ...state.project, ...this.values };
        return {
          data: { id: state.project.id, updated_at: state.project.updated_at },
          error: state.updateError,
        };
      }
      return { data: null, error: state.updateError };
    }
    if (this.table === "businesses") {
      return { data: state.business, error: state.businessError };
    }
    if (this.table === "services") {
      state.servicesLimit = this.limitCount;
      return { data: state.services, error: state.servicesError };
    }
    if (this.table === "generations") {
      state.generationInsert = this.values;
      return { data: null, error: state.generationError };
    }
    throw new Error(`Unexpected database operation: ${this.table}/${this.action}`);
  }
}

class ProviderError extends Error {
  constructor(category) {
    super("Provider failed");
    this.category = category;
    this.name = "ContentProviderError";
  }
}

const provider = {
  error: null,
  calls: [],
  result: {
    outputText: JSON.stringify({
      title: "A fresh look",
      content: "A welcoming beauty post.",
      cta: null,
      hashtags: ["#beauty"],
      notes: null,
    }),
    model: "gpt-4.1-mini",
    inputTokens: 120,
    outputTokens: 30,
  },
};

class MockOpenAI {
  constructor(options) {
    state.sdkOptions = options;
    this.responses = {
      create: async (request) => {
        state.sdkRequest = request;
        state.events.push("provider");
        if (state.sdkError) throw state.sdkError;
        return state.sdkResponse;
      },
    };
  }
}

class MockGoogleGenAI {
  constructor(options) {
    state.googleOptions = options;
    this.models = {
      generateContent: async (request) => {
        state.googleRequest = request;
        state.events.push("provider");
        if (state.googleError) throw state.googleError;
        return state.googleResponse;
      },
    };
  }
}

class MockAPIError extends Error {
  constructor(status) {
    super("mock SDK error");
    this.status = status;
  }
}

const originalLoad = Module._load;
function ProjectFormStub() {
  return null;
}
function ProjectDeleteButtonStub() {
  return null;
}

Module._load = function (request, parent, isMain) {
  if (request === "openai") {
    return {
      __esModule: true,
      default: MockOpenAI,
      APIConnectionError: class extends Error {},
      APIConnectionTimeoutError: class extends Error {},
      APIError: MockAPIError,
      RateLimitError: class extends Error {},
    };
  }
  if (request === "@google/genai") {
    return { GoogleGenAI: MockGoogleGenAI };
  }
  if (request === "server-only") return {};
  if (request === "next/server") {
    return {
      NextResponse: {
        json(body, init = {}) {
          return new Response(JSON.stringify(body), {
            ...init,
            headers: { "content-type": "application/json", ...init.headers },
          });
        },
      },
    };
  }
  if (request === "next/navigation") {
    return {
      notFound() {
        throw new Error("notFound");
      },
      useRouter() {
        return {
          refresh() {
            state.refreshCalls = (state.refreshCalls ?? 0) + 1;
          },
        };
      },
    };
  }
  if (request === "next/cache") {
    return {
      revalidatePath(value) {
        state.revalidatedPath = value;
      },
    };
  }
  if (request === "next/link") {
    return {
      __esModule: true,
      default: function Link(props) {
        return originalLoad("react", parent, isMain).createElement("a", props);
      },
    };
  }
  if (request === "@/components/projects/project-form") {
    return { ProjectForm: ProjectFormStub };
  }
  if (request === "@/components/projects/project-delete-button") {
    return { ProjectDeleteButton: ProjectDeleteButtonStub };
  }
  if (request === "@/lib/supabase/server") {
    return { createClient: async () => state.supabase };
  }
  if (request === "@/app/(app)/projects/actions") {
    return { saveEditedGeneratedContent: (input) => state.saveAction(input) };
  }
  if (request === "@/lib/ai/provider") {
    return {
      ContentProviderError: ProviderError,
      maxOutputTokens: 1000,
      providerTimeoutMs: 30_000,
    };
  }
  if (request === "@/lib/openai/client") {
    return {
      ContentProviderError: ProviderError,
      openAiModel: "gpt-4.1-mini",
      async generateProjectContent(instructions, input) {
        provider.calls.push({ name: "openai", instructions, input });
        state.events.push("provider");
        if (provider.error) throw provider.error;
        return provider.result;
      },
    };
  }
  if (request === "@/lib/gemini/client") {
    return {
      geminiModel: "gemini-3.5-flash-lite",
      async generateProjectContent(instructions, input) {
        provider.calls.push({ name: "gemini", instructions, input });
        state.events.push("provider");
        if (provider.error) throw provider.error;
        return { ...provider.result, model: "gemini-3.5-flash-lite" };
      },
    };
  }
  if (request.startsWith("@/")) {
    const modulePath = path.join(root, request.slice(2));
    const typescriptPath = `${modulePath}.ts`;
    return originalLoad(
      fs.existsSync(typescriptPath) ? typescriptPath : `${modulePath}.tsx`,
      parent,
      isMain,
    );
  }
  return originalLoad.call(this, request, parent, isMain);
};

const route = require(path.join(root, "app/api/generate/route.ts"));
const promptBuilder = require(path.join(root, "lib/prompts/project-content.ts"));
const outputValidator = require(path.join(root, "lib/validation/generated-content.ts"));
const generationClient = require(path.join(root, "lib/projects/generation-client.ts"));
const projectActions = require(path.join(root, "app/(app)/projects/actions.ts"));
const {
  ProjectGeneration,
  applyGeneratedContentDraft,
  copyGeneratedContentToClipboard,
  createGeneratedContentDraft,
  formatContentForClipboard,
} = require(path.join(root, "components/projects/project-generation.tsx"));
const projectDetailPage = require(path.join(root, "app/(app)/projects/[id]/page.tsx"));
const { renderToStaticMarkup } = require("react-dom/server");
const openAiClient = require(path.join(root, "lib/openai/client.ts"));
const geminiClient = require(path.join(root, "lib/gemini/client.ts"));

function reset(overrides = {}) {
  const { aiProvider = "openai", ...stateOverrides } = overrides;
  if (aiProvider === null) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = aiProvider;
  Object.assign(state, {
    authenticated: true,
    project: {
      id: "project-a",
      user_id: "user-a",
      business_id: "business-a",
      type: "post",
      goal: "Promote a relaxing treatment",
      title: "Spring offer",
      updated_at: "2026-10-09T10:00:00.000Z",
      content: JSON.stringify({
        title: "Saved title",
        content: "Saved body",
        cta: "Book a visit",
        hashtags: ["#beauty", "#selfcare"],
        notes: "Review before publishing.",
      }),
      updated_at: "2026-10-09T10:00:00.000Z",
    },
    projectError: null,
    business: {
      id: "business-a",
      user_id: "user-a",
      name: "Studio A",
      industry: "Beauty",
      city: "Sample City",
      description: "A calm studio",
      target_audience: "Adults seeking relaxation",
      tone_of_voice: "Warm",
      brand_description: null,
      brand_advantages: null,
      preferred_phrases: "Feel at home",
      forbidden_phrases: "Guaranteed results",
    },
    businessError: null,
    services: [{ name: "Facial", description: "A gentle facial", price: 50, currency: "USD" }],
    servicesError: null,
    updateReturnsRow: true,
    updateError: null,
    generationError: null,
    quotaResult: [{
      allowed: true,
      remaining_attempts: 4,
      reset_at: "2026-10-10T00:00:00+00:00",
    }],
    quotaError: null,
    quotaRpcThrows: false,
    quotaMalformedEnvelope: false,
    quotaCalls: [],
    events: [],
    googleError: null,
    googleResponse: {
      text: '{"title":"Title","content":"Body","cta":null,"hashtags":[],"notes":null}',
      modelVersion: "gemini-3.5-flash-lite",
      usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 18, thoughtsTokenCount: 5 },
    },
    projectUpdate: null,
    projectUpdateFilters: null,
    saveAction: async () => ({ ok: false, code: "unavailable", message: "Save failed." }),
    revalidatedPath: null,
    generationInsert: null,
    servicesLimit: null,
    refreshCalls: 0,
    queries: [],
    supabase: {
      auth: {
        getClaims: async () => state.authenticated
          ? { data: { claims: { sub: "user-a" } }, error: null }
          : { data: { claims: null }, error: null },
      },
      rpc: async (name, args) => {
        state.quotaCalls.push({ name, args });
        state.events.push("reservation");
        if (state.quotaRpcThrows) throw new Error("private RPC failure");
        if (state.quotaMalformedEnvelope) return null;
        return { data: state.quotaResult, error: state.quotaError };
      },
      from: (table) => new MockQuery(table),
    },
    ...stateOverrides,
  });
  provider.error = null;
  provider.calls = [];
  provider.result = {
    outputText: JSON.stringify({
      title: "A fresh look",
      content: "A welcoming beauty post.",
      cta: null,
      hashtags: ["#beauty"],
      notes: null,
    }),
    model: "gpt-4.1-mini",
    inputTokens: 120,
    outputTokens: 30,
  };
}

async function post(body) {
  return route.POST(new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function responseJson(response) {
  return response.json();
}

const savedGeneratedContent = {
  title: "Saved title",
  content: "Saved body",
  cta: "Book a visit",
  hashtags: ["#beauty", "#selfcare"],
  notes: "Review before publishing.",
};

function findElementByType(element, type) {
  if (!element || typeof element !== "object") return null;
  if (element.type === type) return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = findElementByType(child, type);
    if (match) return match;
  }
  return null;
}

function createProjectGenerationHarness(props) {
  const componentPath = path.join(root, "components/projects/project-generation.tsx");
  const componentModule = new Module(componentPath, module);
  componentModule.filename = componentPath;
  componentModule.paths = Module._nodeModulePaths(path.dirname(componentPath));
  const slots = [];
  let hookIndex = 0;
  let pendingEffects = [];
  let committedRefs = new Set();
  const focusEvents = [];
  const hooks = {
    useState(initialValue) {
      const index = hookIndex++;
      if (!(index in slots)) slots[index] = initialValue;
      return [
        slots[index],
        (value) => {
          slots[index] = typeof value === "function" ? value(slots[index]) : value;
        },
      ];
    },
    useRef(initialValue) {
      const index = hookIndex++;
      if (!(index in slots)) slots[index] = { current: initialValue };
      return slots[index];
    },
    useCallback(callback, dependencies) {
      const index = hookIndex++;
      const previous = slots[index];
      if (
        !previous
        || dependencies.some((dependency, dependencyIndex) => !Object.is(dependency, previous.dependencies[dependencyIndex]))
      ) {
        slots[index] = { callback, dependencies };
      }
      return slots[index].callback;
    },
    useEffect(effect, dependencies) {
      const index = hookIndex++;
      const previous = slots[index];
      if (
        !previous
        || dependencies.some((dependency, dependencyIndex) => !Object.is(dependency, previous.dependencies[dependencyIndex]))
      ) {
        pendingEffects.push(effect);
      }
      slots[index] = { dependencies };
    },
  };
  const source = fs.readFileSync(componentPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const currentLoader = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "react" && parent?.filename === componentPath) return hooks;
    return currentLoader.call(this, request, parent, isMain);
  };
  try {
    componentModule._compile(outputText, componentPath);
  } finally {
    Module._load = currentLoader;
  }

  function render() {
    hookIndex = 0;
    pendingEffects = [];
    const nodes = [];
    const nextRefs = new Set();
    const parents = new Map();
    function visit(node, parent = null) {
      if (Array.isArray(node)) {
        node.forEach((child) => visit(child, parent));
        return;
      }
      if (!node || typeof node !== "object" || !("type" in node)) return;
      if (typeof node.type === "function") {
        visit(node.type(node.props), parent);
        return;
      }
      parents.set(node, parent);
      if (node.props?.ref) {
        const ref = node.props.ref;
        nextRefs.add(ref);
        if (!ref.current) {
          function createMockElement(targetNode) {
            return {
              focus() {
                focusEvents.push(
                  targetNode.props.id
                  ?? targetNode.props.role
                  ?? (targetNode.type === "button" ? getText(targetNode) : targetNode.type),
                );
              },
              querySelector(selector) {
                const targetType = selector === "textarea" ? "textarea" : "button";
                const targetNode = nodes.find((candidate) => {
                  if (candidate.type !== targetType) return false;
                  let ancestor = parents.get(candidate);
                  while (ancestor && ancestor !== node) ancestor = parents.get(ancestor);
                  return ancestor === node;
                });
                return targetNode ? createMockElement(targetNode) : null;
              },
            };
          }
          ref.current = createMockElement(node);
        }
      }
      nodes.push(node);
      visit(node.props?.children, node);
    }
    visit(componentModule.exports.ProjectGeneration({
      initialRevision: "2026-10-09T10:00:00.000Z",
      ...props,
    }));
    for (const ref of committedRefs) {
      if (!nextRefs.has(ref)) ref.current = null;
    }
    committedRefs = nextRefs;
    for (const effect of pendingEffects) effect();
    return nodes;
  }

  return {
    focusEvents,
    render,
    updateProps(nextProps) {
      Object.assign(props, nextProps);
      render();
      return render();
    },
  };
}

function getText(node) {
  if (Array.isArray(node)) return node.map(getText).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node?.props?.children ? getText(node.props.children) : "";
}

function findButton(nodes, text) {
  return nodes.find((node) => node.type === "button" && getText(node) === text);
}

function findTextarea(nodes, id) {
  return nodes.find((node) => node.type === "textarea" && node.props.id === id);
}

test("treats malformed saved content as unavailable and passes valid saved content to the generation UI", async () => {
  assert.deepEqual(
    outputValidator.parseSavedGeneratedContent(JSON.stringify(savedGeneratedContent)),
    savedGeneratedContent,
  );
  for (const invalid of [null, {}, "legacy content", "{malformed json"]) {
    assert.equal(outputValidator.parseSavedGeneratedContent(invalid), null);
  }

  reset({
    project: { ...resetProject(), content: "{malformed json" },
  });
  let page = await projectDetailPage.default({
    params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
  });
  let query = state.queries.find((item) => item.table === "projects");
  assert.match(query.columns, /\bcontent\b/);
  assert.deepEqual(query.filters, [
    ["id", "123e4567-e89b-12d3-a456-426614174000"],
    ["user_id", "user-a"],
  ]);
  assert.equal(findElementByType(page, ProjectGeneration).props.savedContent, null);
  assert.ok(findElementByType(page, ProjectFormStub));
  assert.ok(findElementByType(page, ProjectDeleteButtonStub));

  reset({
    project: {
      ...resetProject(),
      content: JSON.stringify(savedGeneratedContent),
    },
  });
  page = await projectDetailPage.default({
    params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
  });
  assert.deepEqual(findElementByType(page, ProjectGeneration).props.savedContent, savedGeneratedContent);
  assert.equal(
    findElementByType(page, ProjectGeneration).props.initialRevision,
    "2026-10-09T10:00:00.000Z",
  );
});

test("renders previously saved generated content as escaped text", () => {
  const unsafeText = "<script>not markup</script>";
  const markup = renderToStaticMarkup(
    require("react").createElement(ProjectGeneration, {
      projectId: "project-a",
      savedContent: { ...savedGeneratedContent, content: unsafeText },
    }),
  );
  assert.match(markup, /Regenerate Content/);
  assert.match(markup, /Copy Content/);
  assert.match(markup, /Saved title/);
  assert.match(markup, /&lt;script&gt;not markup&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<script>/);

  const emptyMarkup = renderToStaticMarkup(
    require("react").createElement(ProjectGeneration, {
      projectId: "project-a",
      savedContent: null,
    }),
  );
  assert.doesNotMatch(emptyMarkup, /Copy Content/);
});

test("keys editing state to project identity", () => {
  const element = ProjectGeneration({
    projectId: "project-b",
    savedContent: savedGeneratedContent,
    initialRevision: "2026-10-09T10:00:00.000Z",
  });
  assert.equal(element.key, "project-b");
});

test("saves edited content with verified ownership, preserved metadata, and revision compare-and-swap", async () => {
  reset();
  const result = await projectActions.saveEditedGeneratedContent({
    projectId: "123e4567-e89b-12d3-a456-426614174000",
    expectedUpdatedAt: "2026-10-09T10:00:00.000Z",
    editedContent: {
      content: "Edited body",
      cta: null,
      hashtags: ["#Fresh"],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.content, {
    title: "Saved title",
    content: "Edited body",
    cta: null,
    hashtags: ["#Fresh"],
    notes: "Review before publishing.",
  });
  assert.ok(Date.parse(result.revision) > Date.parse("2026-10-09T10:00:00.000Z"));
  assert.deepEqual(state.projectUpdate, {
    content: JSON.stringify(result.content),
    updated_at: result.revision,
  });
  const updateQuery = state.queries.find((query) => query.table === "projects" && query.action === "update");
  assert.deepEqual(updateQuery.filters, [
    ["id", "123e4567-e89b-12d3-a456-426614174000"],
    ["user_id", "user-a"],
    ["updated_at", "2026-10-09T10:00:00.000Z"],
  ]);
  assert.deepEqual(state.queries[0].filters, [
    ["id", "123e4567-e89b-12d3-a456-426614174000"],
    ["user_id", "user-a"],
  ]);
  assert.deepEqual(Object.keys(state.projectUpdate).sort(), ["content", "updated_at"]);
  assert.equal(state.revalidatedPath, "/projects/123e4567-e89b-12d3-a456-426614174000");
  assert.equal(state.generationInsert, null);
  assert.equal(provider.calls.length, 0);
});

test("rejects unauthenticated, inaccessible, invalid and unexpected save inputs before mutation", async () => {
  reset({ authenticated: false });
  let result = await projectActions.saveEditedGeneratedContent({
    projectId: "123e4567-e89b-12d3-a456-426614174000",
    expectedUpdatedAt: "2026-10-09T10:00:00.000Z",
    editedContent: { content: "Edited", cta: null, hashtags: [] },
  });
  assert.equal(result.code, "unauthenticated");
  assert.equal(state.queries.length, 0);

  for (const input of [
    null,
    { projectId: "not-a-uuid", expectedUpdatedAt: "2026-10-09T10:00:00.000Z", editedContent: {} },
    { projectId: "123e4567-e89b-12d3-a456-426614174000", expectedUpdatedAt: "bad", editedContent: {} },
    {
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      expectedUpdatedAt: "2026-10-09T10:00:00.000Z",
      editedContent: { content: "Edited", cta: null, hashtags: [], title: "forbidden" },
    },
    {
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      expectedUpdatedAt: "2026-10-09T10:00:00.000Z",
      editedContent: { content: "Edited", cta: null, hashtags: [] },
      user_id: "user-b",
    },
    {
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      expectedUpdatedAt: "2026-10-09T10:00:00.000Z",
      editedContent: { content: "Edited", cta: null, hashtags: ["#x".repeat(50)] },
    },
    {
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      expectedUpdatedAt: "2026-10-09T10:00:00.000Z",
      editedContent: {
        content: "x".repeat(outputValidator.generatedContentLimits.content + 1),
        cta: null,
        hashtags: [],
      },
    },
    {
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      expectedUpdatedAt: "2026-10-09T10:00:00.000Z",
      editedContent: {
        content: "Edited",
        cta: "x".repeat(outputValidator.generatedContentLimits.cta + 1),
        hashtags: [],
      },
    },
    {
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      expectedUpdatedAt: "2026-10-09T10:00:00.000Z",
      editedContent: {
        content: "Edited",
        cta: null,
        hashtags: Array(outputValidator.generatedContentLimits.hashtags + 1).fill("#tag"),
      },
    },
  ]) {
    reset();
    result = await projectActions.saveEditedGeneratedContent(input);
    assert.equal(result.code, "invalid");
    assert.equal(state.projectUpdate, null);
  }

  reset({ project: null });
  result = await projectActions.saveEditedGeneratedContent({
    projectId: "123e4567-e89b-12d3-a456-426614174000",
    expectedUpdatedAt: "2026-10-09T10:00:00.000Z",
    editedContent: { content: "Edited", cta: null, hashtags: [] },
  });
  assert.equal(result.code, "unavailable");
  assert.equal(state.projectUpdate, null);
});

test("rejects malformed stored content, stale revisions and concurrent saves without overwriting", async () => {
  for (const invalidContent of [null, "legacy text", "{broken", JSON.stringify({ title: "", content: "" })]) {
    reset({ project: { ...resetProject(), content: invalidContent } });
    const result = await projectActions.saveEditedGeneratedContent({
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      expectedUpdatedAt: "2026-10-09T10:00:00.000Z",
      editedContent: { content: "Edited body", cta: null, hashtags: [] },
    });
    assert.equal(result.code, "unavailable");
    assert.equal(state.projectUpdate, null);
  }

  reset({ project: { ...resetProject(), updated_at: "2026-10-09T10:00:00.002Z" } });
  const staleResult = await projectActions.saveEditedGeneratedContent({
    projectId: "123e4567-e89b-12d3-a456-426614174000",
    expectedUpdatedAt: "2026-10-09T10:00:00.000Z",
    editedContent: { content: "Stale body", cta: null, hashtags: [] },
  });
  assert.equal(staleResult.code, "conflict");
  assert.equal(state.projectUpdate, null);

  reset();
  const concurrentInput = {
    projectId: "123e4567-e89b-12d3-a456-426614174000",
    expectedUpdatedAt: "2026-10-09T10:00:00.000Z",
    editedContent: { content: "Concurrent body", cta: null, hashtags: [] },
  };
  const results = await Promise.all([
    projectActions.saveEditedGeneratedContent(concurrentInput),
    projectActions.saveEditedGeneratedContent(concurrentInput),
  ]);
  assert.equal(results.filter((item) => item.ok).length, 1);
  assert.equal(results.filter((item) => item.code === "conflict").length, 1);
});

test("formats copied content without title or notes and omits missing optional sections", () => {
  assert.equal(
    formatContentForClipboard(savedGeneratedContent),
    "Saved body\n\nBook a visit\n\n#beauty #selfcare",
  );

  assert.equal(formatContentForClipboard({
    ...savedGeneratedContent,
    title: "Must not be copied",
    content: "Only the body",
    cta: null,
    hashtags: [],
    notes: "Must not be copied",
  }), "Only the body");
});

test("normalizes and validates local drafts while preserving title and notes", () => {
  const draft = createGeneratedContentDraft(savedGeneratedContent);
  assert.deepEqual(draft, {
    content: "Saved body",
    cta: "Book a visit",
    hashtags: "#beauty\n#selfcare",
  });

  const updated = applyGeneratedContentDraft(savedGeneratedContent, {
    content: "  Edited body  ",
    cta: " \t ",
    hashtags: " #Glow \n\n#SelfCare  \n",
  });
  assert.deepEqual(updated, {
    title: savedGeneratedContent.title,
    content: "Edited body",
    cta: null,
    hashtags: ["#Glow", "#SelfCare"],
    notes: savedGeneratedContent.notes,
  });
  assert.throws(
    () => applyGeneratedContentDraft(savedGeneratedContent, {
      content: " ",
      cta: "",
      hashtags: "",
    }),
    outputValidator.GeneratedContentValidationError,
  );
  assert.throws(
    () => applyGeneratedContentDraft(savedGeneratedContent, {
      content: "x".repeat(outputValidator.generatedContentLimits.content + 1),
      cta: "",
      hashtags: "",
    }),
    outputValidator.GeneratedContentValidationError,
  );
  assert.throws(
    () => applyGeneratedContentDraft(savedGeneratedContent, {
      content: "Body",
      cta: "x".repeat(outputValidator.generatedContentLimits.cta + 1),
      hashtags: "",
    }),
    outputValidator.GeneratedContentValidationError,
  );
  assert.throws(
    () => applyGeneratedContentDraft(savedGeneratedContent, {
      content: "Body",
      cta: "",
      hashtags: Array(outputValidator.generatedContentLimits.hashtags + 1).fill("#tag").join("\n"),
    }),
    outputValidator.GeneratedContentValidationError,
  );
  assert.throws(
    () => applyGeneratedContentDraft(savedGeneratedContent, {
      content: "Body",
      cta: "",
      hashtags: `#${"x".repeat(outputValidator.generatedContentLimits.hashtag)}`,
    }),
    outputValidator.GeneratedContentValidationError,
  );
  assert.throws(
    () => applyGeneratedContentDraft({
      ...savedGeneratedContent,
      title: "x".repeat(outputValidator.generatedContentLimits.title + 1),
    }, {
      content: "Body",
      cta: "",
      hashtags: "",
    }),
    outputValidator.GeneratedContentValidationError,
  );
  assert.throws(
    () => applyGeneratedContentDraft({
      ...savedGeneratedContent,
      notes: "x".repeat(outputValidator.generatedContentLimits.notes + 1),
    }, {
      content: "Body",
      cta: "",
      hashtags: "",
    }),
    outputValidator.GeneratedContentValidationError,
  );
});

test("applies edits locally, copies the applied version, and cancels drafts without requests", async () => {
  const harness = createProjectGenerationHarness({
    projectId: "project-a",
    savedContent: savedGeneratedContent,
  });
  const originalFetch = globalThis.fetch;
  let apiCalls = 0;
  globalThis.fetch = async () => {
    apiCalls += 1;
    throw new Error("Unexpected API call");
  };

  try {
    let nodes = harness.render();
    assert.deepEqual(harness.focusEvents, []);
    await findButton(nodes, "Edit Content").props.onClick();
    nodes = harness.render();
    assert.equal(harness.focusEvents.at(-1), "generated-content-draft");
    assert.ok(nodes.some((node) => node.type === "p" && /local and are not saved/i.test(getText(node))));
    assert.equal(findButton(nodes, "Regenerate Content").props.disabled, true);
    assert.equal(findButton(nodes, "Copy Content").props.disabled, true);
    assert.equal(findTextarea(nodes, "generated-content-draft").props.maxLength, 8000);
    assert.equal(findTextarea(nodes, "generated-content-cta").props.maxLength, 400);
    assert.equal(findTextarea(nodes, "generated-content-hashtags").props["aria-describedby"], "generated-content-hashtags-help");

    findTextarea(nodes, "generated-content-draft").props.onChange({ target: { value: "Edited body" } });
    nodes = harness.render();
    findTextarea(nodes, "generated-content-cta").props.onChange({ target: { value: "New CTA" } });
    nodes = harness.render();
    findTextarea(nodes, "generated-content-hashtags").props.onChange({
      target: { value: "#new\n#unchanged-prefix" },
    });
    nodes = harness.render();
    await findButton(nodes, "Apply Changes").props.onClick();
    nodes = harness.render();
    const display = nodes.map(getText).join("");
    assert.match(display, /Edited body/);
    assert.match(display, /New CTA/);
    assert.match(display, /#new/);
    assert.match(display, /#unchanged-prefix/);
    assert.match(display, /Changes applied locally\. They are not saved to your project until you select Save Changes\./);
    assert.match(display, /Saved title/);
    assert.match(display, /Review before publishing\./);
    assert.equal(apiCalls, 0);
    assert.equal(harness.focusEvents.at(-1), "Edit Content");

    const writes = [];
    await withMockedClipboard({
      writeText: async (value) => writes.push(value),
    }, async () => {
      nodes = harness.render();
      await findButton(nodes, "Copy Content").props.onClick();
    });
    assert.deepEqual(writes, ["Edited body\n\nNew CTA\n\n#new #unchanged-prefix"]);
    assert.equal(apiCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const cancelHarness = createProjectGenerationHarness({
    projectId: "project-a",
    savedContent: savedGeneratedContent,
  });
  let nodes = cancelHarness.render();
  await findButton(nodes, "Edit Content").props.onClick();
  nodes = cancelHarness.render();
  assert.equal(cancelHarness.focusEvents.at(-1), "generated-content-draft");
  findTextarea(nodes, "generated-content-draft").props.onChange({
    target: { value: "Discard this draft" },
  });
  nodes = cancelHarness.render();
  await findButton(nodes, "Cancel").props.onClick();
  nodes = cancelHarness.render();
  assert.equal(cancelHarness.focusEvents.at(-1), "Edit Content");
  const cancelledDisplay = nodes.map(getText).join("");
  assert.match(cancelledDisplay, /Saved body/);
  assert.doesNotMatch(cancelledDisplay, /Discard this draft/);
  assert.doesNotMatch(cancelledDisplay, /Changes applied locally/);
});

test("keeps invalid drafts open with accessible validation feedback", async () => {
  const harness = createProjectGenerationHarness({
    projectId: "project-a",
    savedContent: savedGeneratedContent,
  });
  let nodes = harness.render();
  await findButton(nodes, "Edit Content").props.onClick();
  nodes = harness.render();
  findTextarea(nodes, "generated-content-draft").props.onChange({ target: { value: " " } });
  nodes = harness.render();
  await findButton(nodes, "Apply Changes").props.onClick();
  nodes = harness.render();
  assert.ok(findTextarea(nodes, "generated-content-draft"));
  assert.equal(findTextarea(nodes, "generated-content-draft").props.value, " ");
  assert.ok(nodes.some((node) => node.props.role === "alert"));
  assert.equal(harness.focusEvents.at(-1), "alert");
  const focusCount = harness.focusEvents.length;
  findButton(nodes, "Apply Changes").props.onClick();
  nodes = harness.render();
  assert.equal(harness.focusEvents.length, focusCount + 1);
  assert.equal(harness.focusEvents.at(-1), "alert");
});

test("adopts newer server content after refresh and ignores equal or older revisions", () => {
  const harness = createProjectGenerationHarness({
    projectId: "project-a",
    savedContent: savedGeneratedContent,
  });

  let nodes = harness.updateProps({
    savedContent: { ...savedGeneratedContent, content: "New server version" },
    initialRevision: "2026-10-09T10:00:00.000001Z",
  });
  assert.match(nodes.map(getText).join(""), /New server version/);

  nodes = harness.updateProps({
    savedContent: { ...savedGeneratedContent, content: "Same revision but different payload" },
    initialRevision: "2026-10-09T10:00:00.000001Z",
  });
  assert.match(nodes.map(getText).join(""), /New server version/);
  assert.doesNotMatch(nodes.map(getText).join(""), /Same revision but different payload/);

  nodes = harness.updateProps({
    savedContent: { ...savedGeneratedContent, content: "Older server version" },
    initialRevision: "2026-10-09T10:00:00.000000Z",
  });
  assert.match(nodes.map(getText).join(""), /New server version/);
  assert.doesNotMatch(nodes.map(getText).join(""), /Older server version/);
});

test("ignores a stale generation response after a newer server save arrives", async () => {
  const harness = createProjectGenerationHarness({
    projectId: "project-a",
    savedContent: savedGeneratedContent,
  });
  const originalFetch = globalThis.fetch;
  let resolveFetch;
  globalThis.fetch = () => new Promise((resolve) => {
    resolveFetch = resolve;
  });

  try {
    let nodes = harness.render();
    findButton(nodes, "Regenerate Content").props.onClick();
    await new Promise((resolve) => setImmediate(resolve));

    nodes = harness.updateProps({
      savedContent: { ...savedGeneratedContent, content: "Newer saved edit" },
      initialRevision: "2026-10-09T10:00:00.002Z",
    });
    assert.match(nodes.map(getText).join(""), /Newer saved edit/);

    resolveFetch(new Response(JSON.stringify({
      result: { ...savedGeneratedContent, content: "Stale generation result" },
      generation: { metadataRecorded: true },
      revision: "2026-10-09T10:00:00.001Z",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await new Promise((resolve) => setImmediate(resolve));
    nodes = harness.render();

    const display = nodes.map(getText).join("");
    assert.match(display, /Newer saved edit/);
    assert.doesNotMatch(display, /Stale generation result/);
    assert.match(display, /newer version of this project is already saved/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("copies the newest received revision and blocks copying local edits after a conflicting update", async () => {
  const harness = createProjectGenerationHarness({
    projectId: "project-a",
    savedContent: savedGeneratedContent,
  });
  let nodes = harness.updateProps({
    savedContent: { ...savedGeneratedContent, content: "Latest saved version" },
    initialRevision: "2026-10-09T10:00:00.001Z",
  });
  const writes = [];
  await withMockedClipboard({
    writeText: async (value) => writes.push(value),
  }, async () => {
    await findButton(nodes, "Copy Content").props.onClick();
  });
  assert.deepEqual(writes, ["Latest saved version\n\nBook a visit\n\n#beauty #selfcare"]);

  await findButton(nodes, "Edit Content").props.onClick();
  nodes = harness.render();
  findTextarea(nodes, "generated-content-draft").props.onChange({
    target: { value: "My local edit" },
  });
  nodes = harness.render();
  await findButton(nodes, "Apply Changes").props.onClick();
  nodes = harness.render();
  const staleCopyHandler = findButton(nodes, "Copy Content").props.onClick;
  nodes = harness.updateProps({
    savedContent: { ...savedGeneratedContent, content: "Even newer remote save" },
    initialRevision: "2026-10-09T10:00:00.002Z",
  });

  assert.match(nodes.map(getText).join(""), /My local edit/);
  assert.match(nodes.map(getText).join(""), /newer version of this project is available/i);
  assert.equal(findButton(nodes, "Save Changes").props.disabled, true);
  assert.equal(findButton(nodes, "Copy Content").props.disabled, true);
  await withMockedClipboard({
    writeText: async (value) => writes.push(value),
  }, async () => {
    await staleCopyHandler();
    await staleCopyHandler();
  });
  assert.equal(writes.length, 1);

  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  globalThis.window = { confirm: () => true };
  globalThis.fetch = async () => new Response(JSON.stringify({
    result: { ...savedGeneratedContent, content: "Resolved current version" },
    generation: { metadataRecorded: true },
    revision: "2026-10-09T10:00:00.003Z",
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    findButton(nodes, "Regenerate Content").props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    nodes = harness.render();
    assert.doesNotMatch(nodes.map(getText).join(""), /newer version of this project is available/i);

    await withMockedClipboard({
      writeText: async (value) => writes.push(value),
    }, async () => {
      await findButton(nodes, "Copy Content").props.onClick();
    });
    assert.equal(writes.at(-1), "Resolved current version\n\nBook a visit\n\n#beauty #selfcare");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete globalThis.window;
    }
  }
});

test("preserves an open editor draft across an incoming server update", async () => {
  const harness = createProjectGenerationHarness({
    projectId: "project-a",
    savedContent: savedGeneratedContent,
  });
  let nodes = harness.render();
  await findButton(nodes, "Edit Content").props.onClick();
  nodes = harness.render();
  findTextarea(nodes, "generated-content-draft").props.onChange({
    target: { value: "Keep this draft" },
  });
  nodes = harness.render();

  nodes = harness.updateProps({
    savedContent: { ...savedGeneratedContent, content: "New remote content" },
    initialRevision: "2026-10-09T10:00:00.001Z",
  });
  assert.equal(findTextarea(nodes, "generated-content-draft").props.value, "Keep this draft");
  assert.match(nodes.map(getText).join(""), /newer version of this project is available/i);

  await findButton(nodes, "Cancel").props.onClick();
  nodes = harness.render();
  assert.match(nodes.map(getText).join(""), /New remote content/);
  assert.doesNotMatch(nodes.map(getText).join(""), /newer version of this project is available/i);
});

test("saves applied edits once, disables conflicting actions, and synchronizes returned content and revision", async () => {
  state.refreshCalls = 0;
  const harness = createProjectGenerationHarness({
    projectId: "project-a",
    savedContent: savedGeneratedContent,
  });
  let nodes = harness.render();
  await findButton(nodes, "Edit Content").props.onClick();
  nodes = harness.render();
  assert.equal(findButton(nodes, "Save Changes"), undefined);
  findTextarea(nodes, "generated-content-draft").props.onChange({
    target: { value: "Persist this edit" },
  });
  nodes = harness.render();
  await findButton(nodes, "Apply Changes").props.onClick();
  nodes = harness.render();

  let resolveSave;
  const calls = [];
  state.saveAction = (input) => {
    calls.push(input);
    return new Promise((resolve) => {
      resolveSave = resolve;
    });
  };
  const saveButton = findButton(nodes, "Save Changes");
  const savePromise = saveButton.props.onClick();
  assert.deepEqual(calls, [{
    projectId: "project-a",
    expectedUpdatedAt: "2026-10-09T10:00:00.000Z",
    editedContent: {
      content: "Persist this edit",
      cta: savedGeneratedContent.cta,
      hashtags: savedGeneratedContent.hashtags,
    },
  }]);

  nodes = harness.render();
  assert.equal(findButton(nodes, "Saving...").props.disabled, true);
  assert.equal(findButton(nodes, "Edit Content").props.disabled, true);
  assert.equal(findButton(nodes, "Copy Content").props.disabled, true);
  assert.equal(findButton(nodes, "Regenerate Content").props.disabled, true);
  assert.match(nodes.map(getText).join(""), /Saving\.\.\./);
  assert.match(nodes.map(getText).join(""), /Changes applied locally/);
  assert.equal(calls.length, 1);

  resolveSave({
    ok: true,
    content: {
      ...savedGeneratedContent,
      content: "Persist this edit",
    },
    revision: "2026-10-09T10:00:00.001Z",
  });
  await savePromise;
  nodes = harness.render();
  const display = nodes.map(getText).join("");
  assert.match(display, /Persist this edit/);
  assert.match(display, /Changes saved to your project\./);
  assert.doesNotMatch(display, /Changes applied locally/);
  assert.equal(state.refreshCalls, 1);

  await findButton(nodes, "Edit Content").props.onClick();
  nodes = harness.render();
  findTextarea(nodes, "generated-content-draft").props.onChange({
    target: { value: "Second local edit" },
  });
  nodes = harness.render();
  await findButton(nodes, "Apply Changes").props.onClick();
  nodes = harness.render();
  let secondSaveInput;
  state.saveAction = async (input) => {
    secondSaveInput = input;
    return {
      ok: true,
      content: { ...savedGeneratedContent, content: "Second local edit" },
      revision: "2026-10-09T10:00:00.002Z",
    };
  };
  await findButton(nodes, "Save Changes").props.onClick();
  assert.equal(secondSaveInput.expectedUpdatedAt, "2026-10-09T10:00:00.001Z");
});

test("keeps local edits and disclosure after save failure or conflict", async () => {
  for (const result of [
    { ok: false, code: "unavailable", message: "private detail" },
    { ok: false, code: "conflict", message: "private detail" },
    new Error("private network error"),
  ]) {
    state.refreshCalls = 0;
    const harness = createProjectGenerationHarness({
      projectId: "project-a",
      savedContent: savedGeneratedContent,
    });
    state.saveAction = async () => {
      if (result instanceof Error) throw result;
      return result;
    };
    let nodes = harness.render();
    await findButton(nodes, "Edit Content").props.onClick();
    nodes = harness.render();
    findTextarea(nodes, "generated-content-draft").props.onChange({
      target: { value: "Keep local version" },
    });
    nodes = harness.render();
    await findButton(nodes, "Apply Changes").props.onClick();
    nodes = harness.render();
    await findButton(nodes, "Save Changes").props.onClick();
    nodes = harness.render();
    const display = nodes.map(getText).join("");
    assert.match(display, /Keep local version/);
    assert.match(display, /Changes applied locally/);
    assert.match(display, result.code === "conflict" ? /changed elsewhere/i : /could not save/i);
    assert.doesNotMatch(display, /private detail/);
    assert.equal(state.refreshCalls, 0);
  }
});

test("blocks copy after Save Changes receives a revision CAS conflict", async () => {
  const harness = createProjectGenerationHarness({
    projectId: "project-a",
    savedContent: savedGeneratedContent,
  });
  let saveInput;
  state.saveAction = async (input) => {
    saveInput = input;
    return { ok: false, code: "conflict", message: "private database detail" };
  };

  let nodes = harness.render();
  await findButton(nodes, "Edit Content").props.onClick();
  nodes = harness.render();
  findTextarea(nodes, "generated-content-draft").props.onChange({
    target: { value: "Keep local version after conflict" },
  });
  nodes = harness.render();
  await findButton(nodes, "Apply Changes").props.onClick();
  nodes = harness.render();
  const copyHandlerBeforeConflict = findButton(nodes, "Copy Content").props.onClick;

  await findButton(nodes, "Save Changes").props.onClick();
  nodes = harness.render();
  const display = nodes.map(getText).join("");
  assert.equal(saveInput.expectedUpdatedAt, "2026-10-09T10:00:00.000Z");
  assert.match(display, /This project changed elsewhere/);
  assert.match(display, /Keep local version after conflict/);
  assert.doesNotMatch(display, /private database detail/);
  assert.equal(findButton(nodes, "Copy Content").props.disabled, true);

  const writes = [];
  await withMockedClipboard({
    writeText: async (value) => writes.push(value),
  }, async () => {
    await copyHandlerBeforeConflict();
  });
  assert.deepEqual(writes, []);
  assert.match(harness.render().map(getText).join(""), /Keep local version after conflict/);
});

test("uses the revision returned by generation for the next edited-content save", async () => {
  const harness = createProjectGenerationHarness({
    projectId: "project-a",
    savedContent: savedGeneratedContent,
  });
  const originalFetch = globalThis.fetch;
  const savedRevision = "2026-10-09T10:00:00.005Z";
  globalThis.fetch = async () => new Response(JSON.stringify({
    result: {
      ...savedGeneratedContent,
      content: "Generated replacement",
    },
    generation: { metadataRecorded: true },
    revision: savedRevision,
  }), { status: 200 });

  try {
    let nodes = harness.render();
    findButton(nodes, "Regenerate Content").props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    nodes = harness.render();
    assert.match(nodes.map(getText).join(""), /Generated replacement/);

    await findButton(nodes, "Edit Content").props.onClick();
    nodes = harness.render();
    findTextarea(nodes, "generated-content-draft").props.onChange({
      target: { value: "Edited after generation" },
    });
    nodes = harness.render();
    await findButton(nodes, "Apply Changes").props.onClick();
    nodes = harness.render();

    let saveInput;
    state.saveAction = async (input) => {
      saveInput = input;
      return {
        ok: true,
        content: {
          ...savedGeneratedContent,
          content: "Edited after generation",
        },
        revision: "2026-10-09T10:00:00.006Z",
      };
    };
    await findButton(nodes, "Save Changes").props.onClick();
    assert.equal(saveInput.expectedUpdatedAt, savedRevision);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("confirms replacing local edits and preserves or clears them according to generation outcome", async () => {
  const harness = createProjectGenerationHarness({
    projectId: "project-a",
    savedContent: savedGeneratedContent,
  });
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let confirmations = [];
  globalThis.window = {
    confirm(message) {
      confirmations.push(message);
      return confirmations.length > 1;
    },
  };
  let apiCalls = 0;
  const responses = [
    new Response(JSON.stringify({
      error: { code: "provider_unavailable" },
    }), { status: 502 }),
    new Response(JSON.stringify({
      result: {
        ...savedGeneratedContent,
        title: "New generated title",
        content: "New generated body",
      },
      generation: { metadataRecorded: true },
      revision: "2026-10-09T10:00:00.001Z",
    }), { status: 200 }),
  ];
  globalThis.fetch = async () => {
    apiCalls += 1;
    return responses.shift();
  };

  try {
    let nodes = harness.render();
    await findButton(nodes, "Edit Content").props.onClick();
    nodes = harness.render();
    findTextarea(nodes, "generated-content-draft").props.onChange({
      target: { value: "Local applied body" },
    });
    nodes = harness.render();
    await findButton(nodes, "Apply Changes").props.onClick();

    nodes = harness.render();
    await findButton(nodes, "Regenerate Content").props.onClick();
    assert.equal(apiCalls, 0);
    assert.match(nodes.map(getText).join(""), /Local applied body/);

    nodes = harness.render();
    findButton(nodes, "Regenerate Content").props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    nodes = harness.render();
    assert.match(nodes.map(getText).join(""), /Local applied body/);
    assert.match(nodes.map(getText).join(""), /Changes applied locally/);

    findButton(nodes, "Regenerate Content").props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    nodes = harness.render();
    const generatedDisplay = nodes.map(getText).join("");
    assert.equal(apiCalls, 2);
    assert.match(generatedDisplay, /New generated body/);
    assert.doesNotMatch(generatedDisplay, /Changes applied locally/);
    assert.match(generatedDisplay, /Content generated and saved/);
    assert.equal(confirmations.length, 3);
    assert.match(confirmations[0], /replace your locally applied edits/i);

    await findButton(nodes, "Edit Content").props.onClick();
    nodes = harness.render();
    findTextarea(nodes, "generated-content-draft").props.onChange({
      target: { value: "Edited after regeneration" },
    });
    nodes = harness.render();
    await findButton(nodes, "Apply Changes").props.onClick();
    nodes = harness.render();
    const locallyUpdatedDisplay = nodes.map(getText).join("");
    assert.match(locallyUpdatedDisplay, /Changes applied locally/);
    assert.doesNotMatch(locallyUpdatedDisplay, /Content generated and saved/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete globalThis.window;
    }
  }
});

async function withMockedClipboard(clipboard, action) {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: clipboard === undefined ? {} : { clipboard },
  });

  try {
    return await action();
  } finally {
    if (previousNavigator) {
      Object.defineProperty(globalThis, "navigator", previousNavigator);
    } else {
      delete globalThis.navigator;
    }
  }
}

test("copies formatted text and reports success only after the clipboard write resolves", async () => {
  let resolveWrite;
  const writes = [];
  const lock = { current: false };
  await withMockedClipboard({
    writeText(text) {
      writes.push(text);
      return new Promise((resolve) => {
        resolveWrite = resolve;
      });
    },
  }, async () => {
    const result = copyGeneratedContentToClipboard(savedGeneratedContent, lock);
    assert.deepEqual(writes, ["Saved body\n\nBook a visit\n\n#beauty #selfcare"]);
    assert.equal(lock.current, true);
    resolveWrite();
    assert.equal(await result, "copied");
    assert.equal(lock.current, false);
  });
});

test("reports rejected and unavailable clipboard writes without false success", async () => {
  const lock = { current: false };
  await withMockedClipboard({
    writeText: async () => {
      throw new Error("permission denied");
    },
  }, async () => {
    assert.equal(await copyGeneratedContentToClipboard(savedGeneratedContent, lock), "failed");
    assert.equal(lock.current, false);
  });

  await withMockedClipboard(undefined, async () => {
    assert.equal(await copyGeneratedContentToClipboard(savedGeneratedContent, lock), "failed");
    assert.equal(lock.current, false);
  });
});

test("prevents overlapping clipboard writes and copies the latest generated content", async () => {
  let resolveWrite;
  const writes = [];
  const lock = { current: false };
  let currentContent = savedGeneratedContent;
  await withMockedClipboard({
    writeText(text) {
      writes.push(text);
      return new Promise((resolve) => {
        resolveWrite = resolve;
      });
    },
  }, async () => {
    const firstCopy = copyGeneratedContentToClipboard(currentContent, lock);
    assert.equal(await copyGeneratedContentToClipboard(currentContent, lock), "busy");
    assert.equal(writes.length, 1);
    resolveWrite();
    assert.equal(await firstCopy, "copied");

    currentContent = {
      ...savedGeneratedContent,
      content: "Newly generated body",
      cta: null,
      hashtags: ["#new"],
    };
    const latestCopy = copyGeneratedContentToClipboard(currentContent, lock);
    resolveWrite();
    assert.equal(await latestCopy, "copied");
    assert.deepEqual(writes, [
      "Saved body\n\nBook a visit\n\n#beauty #selfcare",
      "Newly generated body\n\n#new",
    ]);
  });
});

test("posts only the project ID, prevents duplicate generation, and exposes loading and success callbacks", async () => {
  const lock = { current: false };
  const events = [];
  let content = null;
  let metadataWarning = false;
  let revision = null;
  let refreshCalls = 0;
  let request;
  let resolveFetch;
  const callbacks = {
    onStart() {
      events.push("loading");
    },
    onSuccess(result, hasMetadataWarning, newRevision) {
      content = result;
      metadataWarning = hasMetadataWarning;
      revision = newRevision;
      events.push("success");
    },
    onError(message) {
      events.push({ error: message });
    },
    onFinish() {
      events.push("finished");
    },
    refresh() {
      refreshCalls += 1;
    },
  };
  const fetcher = (input, options) => {
    request = { input, options };
    return new Promise((resolve) => {
      resolveFetch = resolve;
    });
  };

  const firstRequest = generationClient.submitProjectGeneration(
    "project-a",
    lock,
    callbacks,
    fetcher,
  );
  assert.equal(lock.current, true);
  assert.deepEqual(events, ["loading"]);
  await generationClient.submitProjectGeneration("project-a", lock, callbacks, fetcher);
  assert.equal(request.input, "/api/generate");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.credentials, "same-origin");
  assert.deepEqual(JSON.parse(request.options.body), { projectId: "project-a" });

  resolveFetch(new Response(JSON.stringify({
    result: savedGeneratedContent,
    generation: { metadataRecorded: false },
    revision: "2026-10-09T10:00:00.001Z",
  }), { status: 200, headers: { "content-type": "application/json" } }));
  await firstRequest;
  assert.deepEqual(content, savedGeneratedContent);
  assert.equal(metadataWarning, true);
  assert.equal(revision, "2026-10-09T10:00:00.001Z");
  assert.equal(refreshCalls, 1);
  assert.equal(lock.current, false);
  assert.deepEqual(events, ["loading", "success", "finished"]);
});

test("keeps saved content after safe generation failure and treats malformed success as an error", async () => {
  const lock = { current: false };
  let content = savedGeneratedContent;
  const errors = [];
  const callbacks = {
    onStart() {},
    onSuccess(result) {
      content = result;
    },
    onError(message) {
      errors.push(message);
    },
    onFinish() {},
    refresh() {
      assert.fail("Failed requests must not refresh the page");
    },
  };

  await generationClient.submitProjectGeneration(
    "project-a",
    lock,
    callbacks,
    async () => new Response(JSON.stringify({
      error: {
        code: "provider_unavailable",
        message: "private provider response",
      },
    }), { status: 502 }),
  );
  assert.deepEqual(content, savedGeneratedContent);
  assert.match(errors[0], /could not generate content/i);
  assert.doesNotMatch(errors[0], /private provider response/);
  assert.equal(lock.current, false);

  await generationClient.submitProjectGeneration(
    "project-a",
    lock,
    callbacks,
    async () => new Response(JSON.stringify({
      result: { title: "missing required fields" },
      generation: { metadataRecorded: true },
      revision: "2026-10-09T10:00:00.001Z",
    }), { status: 200 }),
  );
  assert.deepEqual(content, savedGeneratedContent);
  assert.match(errors[1], /could not be displayed/i);
});

test("maps quota exhaustion to a safe message with validated UTC reset information", async () => {
  const errors = [];
  const callbacks = {
    onStart() {},
    onSuccess() {
      assert.fail("Quota-denied requests must not succeed");
    },
    onError(message, code) {
      errors.push({ message, code });
    },
    onFinish() {},
    refresh() {
      assert.fail("Quota-denied requests must not refresh the page");
    },
  };

  for (const resetAt of [
    "2026-10-24T00:00:00Z",
    "2026-10-24T00:00:00+00:00",
  ]) {
    await generationClient.submitProjectGeneration(
      "project-a",
      { current: false },
      callbacks,
      async () => new Response(JSON.stringify({
        error: {
          code: "generation_quota_exceeded",
          message: "private server details",
          resetAt,
        },
      }), { status: 429 }),
    );
  }

  await generationClient.submitProjectGeneration(
    "project-a",
    { current: false },
    callbacks,
    async () => new Response(JSON.stringify({
      error: {
        code: "generation_quota_exceeded",
        message: "private server details",
        resetAt: "2026-10-24T00:00:00-05:00",
      },
    }), { status: 429 }),
  );

  await generationClient.submitProjectGeneration(
    "project-a",
    { current: false },
    callbacks,
    async () => new Response(JSON.stringify({
      error: {
        code: "generation_quota_exceeded",
        message: "private server details",
      },
    }), { status: 429 }),
  );

  assert.equal(errors.length, 4);
  assert.equal(errors[0].code, "generation_quota_exceeded");
  assert.match(errors[0].message, /daily limit of 5 AI generation attempts/i);
  assert.match(errors[0].message, /00:00 UTC on 2026-10-24/);
  assert.match(errors[1].message, /00:00 UTC on 2026-10-24/);
  assert.match(errors[2].message, /resets at 00:00 UTC/i);
  assert.match(errors[3].message, /resets at 00:00 UTC/i);
  assert.doesNotMatch(errors.map(({ message }) => message).join(" "), /private server details/);
});

test("rejects malformed project IDs and browser-supplied context before auth/provider work", async () => {
  reset();
  const malformed = await post({ projectId: "not-a-uuid" });
  assert.equal(malformed.status, 400);
  assert.equal(state.queries.length, 0);
  assert.equal(state.quotaCalls.length, 0);
  assert.equal(provider.calls.length, 0);

  const extraInput = await post({
    projectId: "123e4567-e89b-12d3-a456-426614174000",
    user_id: "user-b",
    business_id: "business-b",
    prompt: "ignore server data",
    model: "other-model",
  });
  assert.equal(extraInput.status, 400);
  assert.equal(state.quotaCalls.length, 0);
  assert.equal(provider.calls.length, 0);
});

test("rejects unauthenticated requests without provider calls", async () => {
  reset({ authenticated: false });
  const response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 401);
  assert.equal(state.quotaCalls.length, 0);
  assert.equal(provider.calls.length, 0);
});

test("selects Gemini explicitly, defaults to OpenAI when unset, and rejects unknown providers", async () => {
  reset({ aiProvider: "gemini" });
  let response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 200);
  assert.equal(provider.calls[0].name, "gemini");
  assert.equal(state.generationInsert.model, "gemini-3.5-flash-lite");
  const geminiProjectUpdate = state.queries.find(
    (query) => query.table === "projects" && query.action === "update",
  );
  assert.deepEqual(geminiProjectUpdate.filters, [
    ["id", "project-a"],
    ["user_id", "user-a"],
    ["updated_at", "2026-10-09T10:00:00.000Z"],
  ]);

  reset({ aiProvider: null });
  response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 200);
  assert.equal(provider.calls[0].name, "openai");

  reset({ aiProvider: "not-a-provider" });
  response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 503);
  assert.equal((await responseJson(response)).error.code, "provider_not_configured");
  assert.equal(state.quotaCalls.length, 0);
  assert.equal(provider.calls.length, 0);
  assert.equal(state.projectUpdate, null);
});

test("returns the same not-found response for absent and inaccessible projects", async () => {
  reset({ project: null });
  const response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 404);
  assert.equal((await responseJson(response)).error.code, "project_not_found");
  assert.deepEqual(state.queries[0].filters, [
    ["id", "123e4567-e89b-12d3-a456-426614174000"],
    ["user_id", "user-a"],
  ]);
  assert.equal(state.quotaCalls.length, 0);
  assert.equal(provider.calls.length, 0);
});

test("loads only the verified owner's business and bounded service list", async () => {
  reset({
    services: Array.from({ length: 12 }, (_, index) => ({
      name: `Service ${index}`,
      description: "A service",
      price: 20,
      currency: "USD",
    })),
  });
  const response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 200);
  const businessQuery = state.queries.find((query) => query.table === "businesses");
  assert.deepEqual(businessQuery.filters, [
    ["id", "business-a"],
    ["user_id", "user-a"],
  ]);
  const serviceQuery = state.queries.find((query) => query.table === "services");
  assert.deepEqual(serviceQuery.filters, [["business_id", "business-a"]]);
  assert.equal(state.servicesLimit, 8);
  const sentContext = JSON.parse(provider.calls[0].input).untrusted_business_project_and_service_data;
  assert.equal(sentContext.business.name, "Studio A");
  assert.equal(sentContext.services.length, 8);
});

test("rejects an unknown project type before provider or persistence", async () => {
  reset({ project: { ...resetProject(), type: "carousel" } });
  const response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 422);
  assert.equal(state.quotaCalls.length, 0);
  assert.equal(provider.calls.length, 0);
  assert.equal(state.projectUpdate, null);
  assert.equal(state.generationInsert, null);
});

function resetProject() {
  return {
    id: "project-a",
    user_id: "user-a",
    business_id: "business-a",
    type: "post",
    goal: "Promote a relaxing treatment",
    title: "Spring offer",
    updated_at: "2026-10-09T10:00:00.000Z",
  };
}

test("builds compact prompts for supported project types with explicit phrase boundaries", () => {
  const context = {
    project: { type: "post", goal: "Tell people about the service", title: "A calm day" },
    business: {
      name: "Studio A",
      industry: "Beauty",
      city: "Sample City",
      description: "Small studio",
      target_audience: "Local clients",
      tone_of_voice: "Warm",
      brand_description: "A relaxing space",
      brand_advantages: "Personal attention",
      preferred_phrases: "Feel at home",
      forbidden_phrases: "Guaranteed results",
    },
    services: [{ name: "Facial", description: "A gentle facial", price: 50, currency: "USD" }],
  };
  for (const type of ["post", "story", "reels", "ad"]) {
    const prompt = promptBuilder.buildProjectContentPrompt({
      ...context,
      project: { ...context.project, type },
    });
    assert.ok(prompt.prompt.length <= promptBuilder.projectContentPromptLimits.promptCharacters);
    assert.ok(prompt.instructions.includes("untrusted user-authored DATA"));
    assert.ok(prompt.instructions.includes("forbidden phrases"));
    assert.ok(prompt.input.includes("Feel at home"));
    assert.ok(prompt.input.includes("Guaranteed results"));
    assert.ok(!prompt.input.includes('"task"'));
  }
});

test("bounds prompt fields, service count, and total context; rejects missing required details", () => {
  const context = {
    project: { type: "story", goal: "g".repeat(10000), title: "t".repeat(1000) },
    business: {
      name: "n".repeat(500),
      industry: null,
      city: null,
      description: "d".repeat(10000),
      target_audience: null,
      tone_of_voice: null,
      brand_description: null,
      brand_advantages: null,
      preferred_phrases: null,
      forbidden_phrases: null,
    },
    services: Array.from({ length: 20 }, () => ({
      name: "s".repeat(500),
      description: "d".repeat(5000),
      price: 20,
      currency: "USD",
    })),
  };
  const prompt = promptBuilder.buildProjectContentPrompt(context);
  const payload = JSON.parse(prompt.input).untrusted_business_project_and_service_data;
  assert.ok(prompt.contextCharacters <= promptBuilder.projectContentPromptLimits.contextCharacters);
  assert.equal(payload.project.goal.length, 500);
  assert.equal(payload.business.name.length, 120);
  assert.equal(payload.business.description.length, 600);
  assert.equal(payload.services.length, 8);
  assert.equal(payload.services[0].description.length, 240);
  assert.throws(
    () => promptBuilder.buildProjectContentPrompt({
      ...context,
      project: { ...context.project, goal: " " },
    }),
    promptBuilder.ProjectContentPromptError,
  );
});

test("validates structured generated output and rejects malformed or oversized results", () => {
  const valid = outputValidator.parseGeneratedContent(JSON.stringify({
    title: "Title",
    content: "Content",
    cta: " ",
    hashtags: [" #beauty "],
    notes: null,
  }));
  assert.equal(valid.cta, null);
  assert.deepEqual(valid.hashtags, ["#beauty"]);
  assert.throws(() => outputValidator.parseGeneratedContent("{"), outputValidator.GeneratedContentValidationError);
  assert.throws(
    () => outputValidator.parseGeneratedContent(" ".repeat(outputValidator.generatedContentLimits.serializedResponse + 1)),
    outputValidator.GeneratedContentValidationError,
  );
  assert.throws(() => outputValidator.validateGeneratedContent({
    title: "Title",
    content: "x".repeat(outputValidator.generatedContentLimits.content + 1),
    cta: null,
    hashtags: [],
    notes: null,
  }), outputValidator.GeneratedContentValidationError);
});

test("provider failure and invalid output persist nothing", async () => {
  reset();
  provider.error = new ProviderError("unavailable");
  let response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 502);
  assert.equal(state.quotaCalls.length, 1);
  assert.deepEqual(state.events, ["reservation", "provider"]);
  assert.equal(state.projectUpdate, null);
  assert.equal(state.generationInsert, null);

  reset();
  provider.result.outputText = JSON.stringify({ title: "", content: "x" });
  response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 502);
  assert.equal(state.quotaCalls.length, 1);
  assert.deepEqual(state.events, ["reservation", "provider"]);
  assert.equal(state.projectUpdate, null);
  assert.equal(state.generationInsert, null);
});

test("Gemini invalid output and provider failure persist nothing", async () => {
  reset({ aiProvider: "gemini" });
  provider.result.outputText = '{"title":"","content":"x"}';
  let response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 502);
  assert.equal(state.projectUpdate, null);
  assert.equal(state.generationInsert, null);

  reset({ aiProvider: "gemini" });
  provider.error = new ProviderError("unavailable");
  response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 502);
  assert.equal(state.projectUpdate, null);
  assert.equal(state.generationInsert, null);
});

test("returns a safe response for rejected Gemini requests", async () => {
  reset({ aiProvider: "gemini" });
  provider.error = new ProviderError("request_rejected");
  const response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 502);
  assert.deepEqual(await responseJson(response), {
    error: {
      code: "provider_request_rejected",
      message: "The content provider rejected the generation request.",
    },
  });
  assert.equal(state.projectUpdate, null);
  assert.equal(state.generationInsert, null);
});

test("reserves a daily attempt atomically before invoking the selected provider", async () => {
  reset({ aiProvider: "gemini" });
  const response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });

  assert.equal(response.status, 200);
  assert.deepEqual(state.quotaCalls, [{
    name: "reserve_daily_generation_attempt",
    args: undefined,
  }]);
  assert.deepEqual(state.events, ["reservation", "provider"]);
  assert.equal(provider.calls[0].name, "gemini");
});

test("denied reservations return a validated quota response without provider or persistence work", async () => {
  reset({
    quotaResult: [{
      allowed: false,
      remaining_attempts: 0,
      reset_at: "2026-10-10T00:00:00+00:00",
    }],
  });

  const response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 429);
  assert.deepEqual(await responseJson(response), {
    error: {
      code: "generation_quota_exceeded",
      message: "The daily generation attempt limit has been reached.",
      resetAt: "2026-10-10T00:00:00.000Z",
    },
  });
  assert.equal(state.quotaCalls.length, 1);
  assert.deepEqual(state.events, ["reservation"]);
  assert.equal(provider.calls.length, 0);
  assert.equal(state.projectUpdate, null);
  assert.equal(state.generationInsert, null);
});

test("reservation errors and malformed RPC results fail closed without leaking database details", async () => {
  const invalidResults = [
    null,
    [],
    { allowed: true, remaining_attempts: 4, reset_at: "2026-10-10T00:00:00Z" },
    [{ allowed: "true", remaining_attempts: 4, reset_at: "2026-10-10T00:00:00Z" }],
    [{ allowed: true, remaining_attempts: 6, reset_at: "2026-10-10T00:00:00Z" }],
    [{ allowed: true, remaining_attempts: 4, reset_at: "not-a-date" }],
    [{ allowed: true, remaining_attempts: 4, reset_at: "2026-10-10T00:00:00-05:00" }],
    [{ allowed: false, remaining_attempts: 1, reset_at: "2026-10-10T00:00:00Z" }],
  ];

  for (const quotaResult of invalidResults) {
    reset({ quotaResult });
    const response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
    assert.equal(response.status, 503);
    assert.equal((await responseJson(response)).error.code, "generation_quota_unavailable");
    assert.equal(provider.calls.length, 0);
    assert.deepEqual(state.events, ["reservation"]);
  }

  for (const overrides of [
    { quotaError: { message: "private database detail" } },
    { quotaRpcThrows: true },
    { quotaMalformedEnvelope: true },
  ]) {
    reset(overrides);
    const response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.match(body, /generation_quota_unavailable/);
    assert.doesNotMatch(body, /private database detail/);
    assert.equal(provider.calls.length, 0);
    assert.deepEqual(state.events, ["reservation"]);
  }
});

test("successful generation owner-scopes persistence, records metadata, and leaves status unchanged", async () => {
  reset();
  const response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 200);
  assert.deepEqual(state.events, ["reservation", "provider"]);
  assert.equal(state.projectUpdate.content, provider.result.outputText);
  assert.ok(state.projectUpdate.prompt);
  assert.ok(state.projectUpdate.updated_at);
  assert.equal(Object.hasOwn(state.projectUpdate, "status"), false);
  const updateQuery = state.queries.find((query) => query.table === "projects" && query.action === "update");
  assert.deepEqual(updateQuery.filters, [
    ["id", "project-a"],
    ["user_id", "user-a"],
    ["updated_at", "2026-10-09T10:00:00.000Z"],
  ]);
  assert.deepEqual(state.generationInsert, {
    project_id: "project-a",
    model: "gpt-4.1-mini",
    input_tokens: 120,
    output_tokens: 30,
  });
  const result = await responseJson(response);
  assert.equal(result.generation.metadataRecorded, true);
  assert.equal(result.revision, state.project.updated_at);
});

test("handles missing token counts and reports metadata-insert partial success", async () => {
  reset();
  provider.result.inputTokens = null;
  provider.result.outputTokens = null;
  let response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 200);
  assert.equal(state.generationInsert.input_tokens, null);
  assert.equal(state.generationInsert.output_tokens, null);

  reset({ generationError: { message: "private database detail" } });
  response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 200);
  assert.ok(state.projectUpdate);
  assert.equal((await responseJson(response)).warning.code, "generation_metadata_not_recorded");
});

test("does not insert metadata when the owned project update fails", async () => {
  reset({ updateError: { message: "private database detail" } });
  const response = await post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(response.status, 500);
  assert.equal(state.quotaCalls.length, 1);
  assert.equal(state.generationInsert, null);
  assert.doesNotMatch(await response.text(), /private database detail/);
});

test("migration defines an atomic five-attempt UTC reservation with authenticated-only RPC access", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/0003_generation_usage_limits.sql"),
    "utf8",
  );

  assert.match(migration, /primary key\s*\(user_id,\s*usage_date_utc\)/i);
  assert.match(migration, /references auth\.users\(id\) on delete cascade/i);
  assert.match(migration, /check \(attempts between 0 and 5\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = pg_catalog, auth/i);
  assert.match(migration, /auth\.uid\(\)/i);
  assert.match(migration, /statement_timestamp\(\) at time zone 'UTC'/i);
  assert.match(migration, /\(v_usage_date \+ 1\)::timestamp at time zone 'UTC'/i);
  assert.match(migration, /on conflict \(user_id, usage_date_utc\)/i);
  assert.match(migration, /where daily_usage\.attempts < 5/i);
  assert.match(migration, /returning daily_usage\.attempts into v_attempts/i);
  assert.match(migration, /owner to postgres/i);
  assert.match(migration, /from public, anon, authenticated, service_role/i);
  assert.match(migration, /from public, anon, service_role/i);
  assert.match(migration, /to authenticated/i);
  assert.doesNotMatch(migration, /create policy[\s\S]*generation_daily_usage/i);
});

test("does not persist generated output or metadata when content changes during generation", async () => {
  reset();
  const providerResult = provider.result;
  let resolveProvider;
  provider.result = new Promise((resolve) => {
    resolveProvider = resolve;
  });

  try {
    const responsePromise = post({ projectId: "123e4567-e89b-12d3-a456-426614174000" });
    await new Promise((resolve) => setImmediate(resolve));
    state.project = { ...state.project, updated_at: "2026-10-09T10:00:00.002Z" };
    resolveProvider({
      outputText: JSON.stringify(savedGeneratedContent),
      model: "gpt-4.1-mini",
      inputTokens: 10,
      outputTokens: 5,
    });
    const response = await responsePromise;
    assert.equal(response.status, 409);
    assert.equal(state.quotaCalls.length, 1);
    assert.equal((await responseJson(response)).error.code, "project_content_conflict");
    assert.equal(state.generationInsert, null);
    assert.deepEqual(state.projectUpdateFilters.at(-1), [
      "updated_at",
      "2026-10-09T10:00:00.000Z",
    ]);
  } finally {
    provider.result = providerResult;
  }
});

test("uses the mocked Responses API with strict JSON, bounded output, and no tools", async () => {
  const priorKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(
    () => openAiClient.generateProjectContent("instructions", "{}"),
    (error) => error instanceof openAiClient.ContentProviderError && error.category === "configuration",
  );

  process.env.OPENAI_API_KEY = "test-key-not-real";
  state.sdkResponse = {
    output_text: '{"title":"Title","content":"Body","cta":null,"hashtags":[],"notes":null}',
    model: "gpt-4.1-mini",
    usage: { input_tokens: 42, output_tokens: 18 },
  };
  state.sdkError = null;
  try {
    const result = await openAiClient.generateProjectContent("instructions", "{}");
    assert.equal(result.model, "gpt-4.1-mini");
    assert.equal(result.inputTokens, 42);
    assert.equal(state.sdkOptions.maxRetries, 0);
    assert.equal(state.sdkOptions.timeout, 30_000);
    assert.equal(state.sdkRequest.model, "gpt-4.1-mini");
    assert.equal(state.sdkRequest.max_output_tokens, 1000);
    assert.equal(state.sdkRequest.text.format.strict, true);
    assert.equal(Object.hasOwn(state.sdkRequest, "tools"), false);
    assert.equal(Object.hasOwn(result, "apiKey"), false);
  } finally {
    if (priorKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = priorKey;
  }
});

test("uses the mocked Gemini API with structured JSON, bounded output, one attempt, and no tools", async () => {
  const priorKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(
    () => geminiClient.generateProjectContent("instructions", "{}"),
    (error) => error.name === "ContentProviderError" && error.category === "configuration",
  );

  process.env.GEMINI_API_KEY = "test-key-not-real";
  state.googleError = null;
  try {
    const result = await geminiClient.generateProjectContent("instructions", '{"context":"bounded"}');
    assert.equal(result.model, "gemini-3.5-flash-lite");
    assert.equal(result.inputTokens, 42);
    assert.equal(result.outputTokens, 23);
    assert.equal(state.googleOptions.apiKey, "test-key-not-real");
    assert.equal(state.googleOptions.httpOptions.apiVersion, "v1beta");
    assert.equal(state.googleOptions.httpOptions.timeout, 30_000);
    assert.equal(state.googleOptions.httpOptions.retryOptions.attempts, 1);
    assert.deepEqual(state.googleRequest, {
      model: "gemini-3.5-flash-lite",
      contents: '{"context":"bounded"}',
      config: {
        systemInstruction: "instructions",
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["title", "content", "cta", "hashtags", "notes"],
          properties: {
            title: { type: "string" },
            content: { type: "string" },
            cta: {
              anyOf: [
                { type: "string" },
                { type: "null" },
              ],
            },
            hashtags: {
              type: "array",
              items: { type: "string" },
            },
            notes: {
              anyOf: [
                { type: "string" },
                { type: "null" },
              ],
            },
          },
        },
        maxOutputTokens: 1000,
        httpOptions: {
          timeout: 30_000,
          retryOptions: { attempts: 1 },
        },
      },
    });
    assert.equal(Object.hasOwn(state.googleRequest.config, "tools"), false);
    assert.equal(Object.hasOwn(result, "apiKey"), false);
  } finally {
    if (priorKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = priorKey;
  }
});

test("maps Gemini rate limits, timeouts, and provider errors without exposing SDK details", async () => {
  const priorKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key-not-real";
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    for (const [status, category] of [
      [400, "request_rejected"],
      [401, "configuration"],
      [403, "configuration"],
      [404, "request_rejected"],
      [429, "rate_limit"],
      [504, "timeout"],
      [503, "unavailable"],
    ]) {
      state.googleError = Object.assign(new Error("private provider detail"), { status });
      await assert.rejects(
        () => geminiClient.generateProjectContent("instructions", "{}"),
        (error) => error.name === "ContentProviderError" && error.category === category,
      );
    }
  } finally {
    console.error = originalConsoleError;
    if (priorKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = priorKey;
  }
});

test("logs only allowlisted fields from SDK-shaped Gemini errors", async () => {
  const priorKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key-not-real";
  const originalConsoleError = console.error;
  const diagnostics = [];
  console.error = (...args) => diagnostics.push(args);
  const privateDetails = [
    "test-key-not-real",
    "Authorization: Bearer private-token",
    "Private business prompt",
    "Private generated content",
    "Raw provider error message",
    "must not be logged",
  ];
  try {
    state.googleError = Object.assign(new Error(JSON.stringify({
      error: {
        code: 404,
        message: privateDetails.join(" "),
        status: "NOT_FOUND",
        details: [{
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "MODEL_NOT_FOUND",
          metadata: { private: "must not be logged" },
        }],
      },
    })), { status: 404 });
    await assert.rejects(
      () => geminiClient.generateProjectContent("Private business prompt", "Private context"),
      (error) => error.name === "ContentProviderError" && error.category === "request_rejected",
    );
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0][0], "[ai-provider]");
    assert.deepEqual(JSON.parse(diagnostics[0][1]), {
      provider: "gemini",
      operation: "generateContent",
      model: "gemini-3.5-flash-lite",
      upstreamStatus: 404,
      errorCode: "NOT_FOUND",
      errorReason: "MODEL_NOT_FOUND",
    });
    for (const diagnosticValue of diagnostics[0]) {
      for (const privateDetail of privateDetails) {
        assert.doesNotMatch(diagnosticValue, new RegExp(privateDetail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
    }

    diagnostics.length = 0;
    state.googleError = Object.assign(new Error(JSON.stringify({
      error: {
        code: 429,
        message: "Sensitive rate-limit response detail",
        status: "RESOURCE_EXHAUSTED",
        details: [{
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "RATE_LIMIT_EXCEEDED",
        }],
      },
    })), { status: 429 });
    await assert.rejects(
      () => geminiClient.generateProjectContent("instructions", "{}"),
      (error) => error.name === "ContentProviderError" && error.category === "rate_limit",
    );
    assert.deepEqual(JSON.parse(diagnostics[0][1]), {
      provider: "gemini",
      operation: "generateContent",
      model: "gemini-3.5-flash-lite",
      upstreamStatus: 429,
      errorCode: "RESOURCE_EXHAUSTED",
      errorReason: "RATE_LIMIT_EXCEEDED",
    });
    assert.doesNotMatch(JSON.stringify(diagnostics), /Sensitive rate-limit response detail/);

    diagnostics.length = 0;
    state.googleError = Object.assign(new Error("{malformed json"), { status: 404 });
    await assert.rejects(() => geminiClient.generateProjectContent("instructions", "{}"));
    assert.deepEqual(JSON.parse(diagnostics[0][1]), {
      provider: "gemini",
      operation: "generateContent",
      model: "gemini-3.5-flash-lite",
      upstreamStatus: 404,
    });

    diagnostics.length = 0;
    state.googleError = Object.assign(new Error(JSON.stringify({
      error: {
        code: 404,
        message: "Sensitive unknown code detail",
        status: "NOT_FOUND",
        details: [{
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "PRIVATE_UNAPPROVED_REASON",
        }],
        privateField: "must not be logged",
      },
    })), { status: 404 });
    await assert.rejects(() => geminiClient.generateProjectContent("instructions", "{}"));
    assert.deepEqual(JSON.parse(diagnostics[0][1]), {
      provider: "gemini",
      operation: "generateContent",
      model: "gemini-3.5-flash-lite",
      upstreamStatus: 404,
      errorCode: "NOT_FOUND",
    });
    assert.doesNotMatch(
      JSON.stringify(diagnostics),
      /Sensitive unknown code detail|PRIVATE_UNAPPROVED_REASON|must not be logged/,
    );
  } finally {
    console.error = originalConsoleError;
    if (priorKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = priorKey;
  }
});
