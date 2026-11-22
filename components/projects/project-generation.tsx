"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveEditedGeneratedContent } from "@/app/(app)/projects/actions";
import { submitProjectGeneration } from "@/lib/projects/generation-client";
import {
  GeneratedContentValidationError,
  generatedContentLimits,
  validateGeneratedContent,
  type GeneratedContent,
} from "@/lib/validation/generated-content";

type CopyLock = { current: boolean };
type CopyResult = "copied" | "failed" | "busy";

export type GeneratedContentDraft = {
  content: string;
  cta: string;
  hashtags: string;
};

type ContentReconciliation = {
  accepted: boolean;
  content: GeneratedContent | null;
  persistedContent: GeneratedContent | null;
  revision: string;
  conflict: boolean;
};

function revisionMicroseconds(revision: string): [number, number] | null {
  const match = revision.match(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/,
  );
  const milliseconds = Date.parse(revision);
  if (!match || !Number.isSafeInteger(milliseconds)) return null;

  const fraction = (match[1] ?? "").padEnd(6, "0");
  const fractionalMicroseconds = Number(fraction || "0");
  const fractionalMilliseconds = Number(fraction.slice(0, 3) || "0") * 1000;
  return [milliseconds, fractionalMicroseconds - fractionalMilliseconds];
}

export function compareProjectRevisions(left: string, right: string): number {
  const leftValue = revisionMicroseconds(left);
  const rightValue = revisionMicroseconds(right);
  if (leftValue === null || rightValue === null) return 0;
  if (leftValue[0] !== rightValue[0]) return leftValue[0] > rightValue[0] ? 1 : -1;
  if (leftValue[1] === rightValue[1]) return 0;
  return leftValue[1] > rightValue[1] ? 1 : -1;
}

export function reconcileProjectContent(input: {
  content: GeneratedContent | null;
  persistedContent: GeneratedContent | null;
  revision: string;
  hasUnsavedLocalEdits: boolean;
  incomingContent: GeneratedContent | null;
  incomingRevision: string;
}): ContentReconciliation {
  if (compareProjectRevisions(input.incomingRevision, input.revision) <= 0) {
    return {
      accepted: false,
      content: input.content,
      persistedContent: input.persistedContent,
      revision: input.revision,
      conflict: false,
    };
  }

  if (input.hasUnsavedLocalEdits) {
    return {
      accepted: true,
      content: input.content,
      persistedContent: input.persistedContent,
      revision: input.incomingRevision,
      conflict: true,
    };
  }

  return {
    accepted: true,
    content: input.incomingContent,
    persistedContent: input.incomingContent,
    revision: input.incomingRevision,
    conflict: false,
  };
}

export function createGeneratedContentDraft(content: GeneratedContent): GeneratedContentDraft {
  return {
    content: content.content,
    cta: content.cta ?? "",
    hashtags: content.hashtags.join("\n"),
  };
}

export function applyGeneratedContentDraft(
  content: GeneratedContent,
  draft: GeneratedContentDraft,
): GeneratedContent {
  const hashtags = draft.hashtags
    .split(/\r?\n/)
    .map((hashtag) => hashtag.trim())
    .filter(Boolean);

  return validateGeneratedContent({
    ...content,
    content: draft.content,
    cta: draft.cta.trim() ? draft.cta : null,
    hashtags,
  });
}

export function formatContentForClipboard(content: GeneratedContent): string {
  return [
    content.content,
    content.cta,
    content.hashtags.length > 0 ? content.hashtags.join(" ") : null,
  ].filter(Boolean).join("\n\n");
}

export async function copyGeneratedContentToClipboard(
  content: GeneratedContent,
  lock: CopyLock,
): Promise<CopyResult> {
  if (lock.current) return "busy";
  lock.current = true;

  try {
    if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
      return "failed";
    }

    await navigator.clipboard.writeText(formatContentForClipboard(content));
    return "copied";
  } catch {
    return "failed";
  } finally {
    lock.current = false;
  }
}

function ProjectGenerationContent({
  projectId,
  savedContent,
  initialRevision,
}: {
  projectId: string;
  savedContent: GeneratedContent | null;
  initialRevision: string;
}) {
  const [content, setContent] = useState(savedContent);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState(false);
  const [metadataWarning, setMetadataWarning] = useState(false);
  const [generationSuccess, setGenerationSuccess] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<"success" | "error" | null>(null);
  const [draft, setDraft] = useState<GeneratedContentDraft | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [validationErrorVersion, setValidationErrorVersion] = useState(0);
  const [revision, setRevision] = useState(initialRevision);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  const [syncConflict, setSyncConflict] = useState(false);
  const [persistedContent, setPersistedContent] = useState(savedContent);
  const requestLock = useRef(false);
  const copyLock = useRef(false);
  const saveLock = useRef(false);
  const generationVersion = useRef(0);
  const revisionRef = useRef(initialRevision);
  const contentRef = useRef(content);
  const persistedContentRef = useRef(persistedContent);
  const syncConflictRef = useRef(false);
  const unsavedLocalEditsRef = useRef(false);
  const serverPropsRef = useRef({ savedContent, initialRevision });
  const mainContentContainerRef = useRef<HTMLDivElement>(null);
  const editButtonContainerRef = useRef<HTMLDivElement>(null);
  const editErrorRef = useRef<HTMLParagraphElement>(null);
  const restoreEditButtonFocus = useRef(false);
  const router = useRouter();
  const hasLocalEdits = content !== null
    && persistedContent !== null
    && (
      content.title !== persistedContent.title
      || content.content !== persistedContent.content
      || content.cta !== persistedContent.cta
      || content.notes !== persistedContent.notes
      || content.hashtags.length !== persistedContent.hashtags.length
      || content.hashtags.some((hashtag, index) => hashtag !== persistedContent.hashtags[index])
    );

  contentRef.current = content;
  persistedContentRef.current = persistedContent;
  unsavedLocalEditsRef.current = hasLocalEdits || isEditing;
  serverPropsRef.current = { savedContent, initialRevision };

  const synchronizeServerContent = useCallback((incomingContent: GeneratedContent | null, incomingRevision: string) => {
    const result = reconcileProjectContent({
      content: contentRef.current,
      persistedContent: persistedContentRef.current,
      revision: revisionRef.current,
      hasUnsavedLocalEdits: unsavedLocalEditsRef.current,
      incomingContent,
      incomingRevision,
    });
    if (!result.accepted) return false;

    revisionRef.current = result.revision;
    syncConflictRef.current = result.conflict;
    setRevision(result.revision);
    setSyncConflict(result.conflict);
    if (!result.conflict) {
      contentRef.current = result.content;
      persistedContentRef.current = result.persistedContent;
      setContent(result.content);
      setPersistedContent(result.persistedContent);
      setSaveState("idle");
    }
    return true;
  }, []);

  useEffect(() => {
    if (isEditing) {
      mainContentContainerRef.current?.querySelector("textarea")?.focus();
    } else if (restoreEditButtonFocus.current) {
      restoreEditButtonFocus.current = false;
      editButtonContainerRef.current?.querySelector("button")?.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    if (editError) editErrorRef.current?.focus();
  }, [editError, validationErrorVersion]);

  useEffect(() => {
    synchronizeServerContent(savedContent, initialRevision);
  }, [initialRevision, savedContent, synchronizeServerContent]);

  function generateContent() {
    if (isEditing || isGenerating || saveLock.current || requestLock.current) return;
    if (
      hasLocalEdits
      && (typeof window === "undefined"
        || !window.confirm("Regenerating will replace your locally applied edits. Continue?"))
    ) {
      return;
    }

    void submitProjectGeneration(projectId, requestLock, {
      onStart() {
        generationVersion.current += 1;
        setIsGenerating(true);
        setError(null);
        setQuotaError(false);
        setMetadataWarning(false);
        setGenerationSuccess(false);
        setCopyFeedback(null);
        setEditError(null);
      },
      onSuccess(generatedContent, hasMetadataWarning, newRevision) {
        generationVersion.current += 1;
        const latestServerProps = serverPropsRef.current;
        if (compareProjectRevisions(latestServerProps.initialRevision, newRevision) > 0) {
          synchronizeServerContent(latestServerProps.savedContent, latestServerProps.initialRevision);
          setError("A newer version of this project is already saved. Review the latest content before continuing.");
          setGenerationSuccess(false);
          return;
        }
        if (compareProjectRevisions(newRevision, revisionRef.current) <= 0) {
          setError("A newer version of this project is already saved. Review the latest content before continuing.");
          setGenerationSuccess(false);
          return;
        }

        revisionRef.current = newRevision;
        contentRef.current = generatedContent;
        persistedContentRef.current = generatedContent;
        syncConflictRef.current = false;
        setContent(generatedContent);
        setPersistedContent(generatedContent);
        setRevision(newRevision);
        setSyncConflict(false);
        setSaveState("idle");
        setDraft(null);
        setIsEditing(false);
        setEditError(null);
        setCopyFeedback(null);
        setMetadataWarning(hasMetadataWarning);
        setGenerationSuccess(true);
      },
      onError(message, code) {
        setError(message);
        setQuotaError(code === "generation_quota_exceeded");
      },
      onFinish() {
        setIsGenerating(false);
      },
      refresh() {
        router.refresh();
      },
    });
  }

  function startEditing() {
    if (!content || isGenerating || isCopying || saveLock.current) return;
    restoreEditButtonFocus.current = true;
    setDraft(createGeneratedContentDraft(content));
    setError(null);
    setEditError(null);
    setCopyFeedback(null);
    setGenerationSuccess(false);
    setSaveState("idle");
    setIsEditing(true);
  }

  function cancelEditing() {
    if (syncConflict && !hasLocalEdits) {
      const latestServerProps = serverPropsRef.current;
      revisionRef.current = latestServerProps.initialRevision;
      contentRef.current = latestServerProps.savedContent;
      persistedContentRef.current = latestServerProps.savedContent;
      syncConflictRef.current = false;
      setRevision(latestServerProps.initialRevision);
      setContent(latestServerProps.savedContent);
      setPersistedContent(latestServerProps.savedContent);
      setSyncConflict(false);
      setSaveState("idle");
    }
    setDraft(null);
    setEditError(null);
    setIsEditing(false);
    setCopyFeedback(null);
  }

  function applyChanges() {
    if (!content || !draft || isGenerating) return;

    try {
      const updatedContent = applyGeneratedContentDraft(content, draft);
      setContent(updatedContent);
      setDraft(null);
      setEditError(null);
      setIsEditing(false);
      setGenerationSuccess(false);
      setCopyFeedback(null);
    } catch (error) {
      if (!(error instanceof GeneratedContentValidationError)) throw error;
      setEditError(
        "Please check that main content is not empty and all fields are within their character and hashtag limits.",
      );
      setValidationErrorVersion((version) => version + 1);
    }
  }

  async function copyContent() {
    if (
      !content
      || isEditing
      || isGenerating
      || saveLock.current
      || copyLock.current
      || syncConflictRef.current
    ) return;
    const latestServerProps = serverPropsRef.current;
    if (compareProjectRevisions(latestServerProps.initialRevision, revisionRef.current) > 0) {
      synchronizeServerContent(latestServerProps.savedContent, latestServerProps.initialRevision);
      return;
    }
    if (syncConflict) return;

    setIsCopying(true);
    setCopyFeedback(null);
    const currentGenerationVersion = generationVersion.current;
    const currentContent = contentRef.current;
    if (!currentContent) {
      setIsCopying(false);
      return;
    }
    const result = await copyGeneratedContentToClipboard(currentContent, copyLock);
    if (currentGenerationVersion !== generationVersion.current) {
      setIsCopying(false);
      return;
    }
    if (result === "copied") setCopyFeedback("success");
    if (result === "failed") setCopyFeedback("error");
    setIsCopying(false);
  }

  async function saveChanges() {
    if (
      !content
      || !hasLocalEdits
      || isEditing
      || isGenerating
      || isCopying
      || saveLock.current
      || syncConflict
    ) return;
    saveLock.current = true;
    setSaveState("saving");

    try {
      const result = await saveEditedGeneratedContent({
        projectId,
        expectedUpdatedAt: revision,
        editedContent: {
          content: content.content,
          cta: content.cta,
          hashtags: content.hashtags,
        },
      });

      if (!result.ok) {
        if (result.code === "conflict") {
          syncConflictRef.current = true;
          setSyncConflict(true);
        }
        setSaveState(result.code === "conflict" ? "conflict" : "error");
        return;
      }

      revisionRef.current = result.revision;
      contentRef.current = result.content;
      persistedContentRef.current = result.content;
      syncConflictRef.current = false;
      setContent(result.content);
      setPersistedContent(result.content);
      setRevision(result.revision);
      setSyncConflict(false);
      setSaveState("saved");
      router.refresh();
    } catch {
      setSaveState("error");
    } finally {
      saveLock.current = false;
    }
  }

  return (
    <section aria-busy={isGenerating || saveState === "saving"} className="space-y-4">
      <Card>
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">AI Content Generation</h2>
            <p className="mt-2 text-sm text-muted">
              Generate structured content using this project and its Business Profile.
            </p>
          </div>
          {isGenerating && (
            <p role="status" aria-live="polite" className="text-sm text-muted">
              Generating content...
            </p>
          )}
          {generationSuccess && (
            <p role="status" aria-live="polite" className="text-sm text-success">
              Content generated and saved.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className={quotaError
                ? "rounded-control border border-warning bg-amber-50 p-3 text-sm text-ink"
                : "text-sm text-error"}
            >
              {error}
            </p>
          )}
          {metadataWarning && (
            <p role="status" className="border-l-4 border-warning bg-amber-50 p-3 text-sm text-ink">
              Content was generated and saved, but generation details could not be recorded.
            </p>
          )}
          <Button
            type="button"
            disabled={isGenerating || isEditing || saveState === "saving"}
            onClick={generateContent}
          >
            {isGenerating ? "Generating..." : content ? "Regenerate Content" : "Generate Content"}
          </Button>
        </div>
      </Card>

      {content && (
        <Card>
          {syncConflict && (
            <p role="alert" className="mb-4 border-l-4 border-warning bg-amber-50 p-3 text-sm text-ink">
              A newer version of this project is available. Your local edits are preserved; saving and copying are paused. Refresh the page to review the latest content, or regenerate to replace your edits.
            </p>
          )}
          {isEditing && draft ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-ink">Edit generated content</h3>
                <p className="mt-1 text-sm text-muted">
                  Changes are local and are not saved to your project.
                </p>
              </div>
              <div ref={mainContentContainerRef} className="space-y-2">
                <label htmlFor="generated-content-draft" className="block text-sm font-medium text-ink">
                  Main content
                </label>
                <Textarea
                  id="generated-content-draft"
                  maxLength={generatedContentLimits.content}
                  value={draft.content}
                  onChange={(event) => {
                    setDraft({ ...draft, content: event.target.value });
                    setEditError(null);
                  }}
                />
                <p className="text-xs text-muted">
                  Maximum {generatedContentLimits.content} characters.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="generated-content-cta" className="block text-sm font-medium text-ink">
                  Call to action (optional)
                </label>
                <Textarea
                  id="generated-content-cta"
                  maxLength={generatedContentLimits.cta}
                  value={draft.cta}
                  onChange={(event) => {
                    setDraft({ ...draft, cta: event.target.value });
                    setEditError(null);
                  }}
                />
                <p className="text-xs text-muted">
                  Maximum {generatedContentLimits.cta} characters.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="generated-content-hashtags" className="block text-sm font-medium text-ink">
                  Hashtags (optional)
                </label>
                <Textarea
                  id="generated-content-hashtags"
                  aria-describedby="generated-content-hashtags-help"
                  value={draft.hashtags}
                  onChange={(event) => {
                    setDraft({ ...draft, hashtags: event.target.value });
                    setEditError(null);
                  }}
                />
                <p id="generated-content-hashtags-help" className="text-xs text-muted">
                  Enter one hashtag per line, up to {generatedContentLimits.hashtags} hashtags and{" "}
                  {generatedContentLimits.hashtag} characters each. Hashtags are not automatically changed.
                </p>
              </div>
              {editError && (
                <p ref={editErrorRef} role="alert" tabIndex={-1} className="text-sm text-error">
                  {editError}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={applyChanges}>Apply Changes</Button>
                <Button type="button" variant="secondary" onClick={cancelEditing}>Cancel</Button>
                <Button type="button" variant="secondary" disabled onClick={copyContent}>
                  Copy Content
                </Button>
              </div>
            </div>
          ) : (
            <>
              <article aria-label="Generated project content" className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-primary">Generated content</p>
                  <h3 className="mt-1 text-lg font-semibold text-ink">{content.title}</h3>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{content.content}</p>
                {content.cta && (
                  <div>
                    <h4 className="text-sm font-semibold text-ink">Call to action</h4>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.cta}</p>
                  </div>
                )}
                {content.hashtags.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-ink">Hashtags</h4>
                    <ul className="mt-1 flex flex-wrap gap-x-2 text-sm text-primary">
                      {content.hashtags.map((hashtag, index) => (
                        <li key={`${hashtag}-${index}`}>{hashtag}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {content.notes && (
                  <div>
                    <h4 className="text-sm font-semibold text-ink">Notes</h4>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{content.notes}</p>
                  </div>
                )}
              </article>
              {hasLocalEdits && (
                <p role="status" aria-live="polite" className="mt-4 border-l-4 border-warning bg-amber-50 p-3 text-sm text-ink">
                  Changes applied locally. They are not saved to your project until you select Save Changes.
                </p>
              )}
              {saveState === "saved" && (
                <p role="status" aria-live="polite" className="mt-4 text-sm text-success">
                  Changes saved to your project.
                </p>
              )}
              {saveState === "error" && (
                <p role="alert" className="mt-4 text-sm text-error">
                  We could not save your changes. Your local edits are still available; please try again.
                </p>
              )}
              {saveState === "conflict" && (
                <p role="alert" className="mt-4 text-sm text-error">
                  This project changed elsewhere. Your local edits are still available. Refresh the page and review the latest content before saving again.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {hasLocalEdits && (
                  <Button
                    type="button"
                    disabled={saveState === "saving" || isGenerating || isCopying || syncConflict || saveState === "conflict"}
                    onClick={saveChanges}
                  >
                    {saveState === "saving" ? "Saving..." : "Save Changes"}
                  </Button>
                )}
                <div ref={editButtonContainerRef}>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isGenerating || isCopying || saveState === "saving"}
                    onClick={startEditing}
                  >
                    Edit Content
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isGenerating || isCopying || saveState === "saving" || syncConflict || saveState === "conflict"}
                  onClick={copyContent}
                >
                  {isCopying ? "Copying..." : "Copy Content"}
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {copyFeedback === "success" && (
                  <p role="status" aria-live="polite" className="text-sm text-success">
                    Content copied.
                  </p>
                )}
                {copyFeedback === "error" && (
                  <p role="alert" className="text-sm text-error">
                    Could not copy content. Please select and copy the displayed text manually.
                  </p>
                )}
              </div>
            </>
          )}
        </Card>
      )}
    </section>
  );
}

export function ProjectGeneration({
  projectId,
  savedContent,
  initialRevision,
}: {
  projectId: string;
  savedContent: GeneratedContent | null;
  initialRevision: string;
}) {
  return (
    <ProjectGenerationContent
      key={projectId}
      projectId={projectId}
      savedContent={savedContent}
      initialRevision={initialRevision}
    />
  );
}
