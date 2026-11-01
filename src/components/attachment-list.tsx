import { deleteAttachment } from "@/lib/actions/songs";
import { formatFileSize, youtubeId } from "@/lib/format";
import { SubmitButton } from "@/components/form";
import { PlayButton } from "@/components/player";
import { RemoveLinkButton } from "@/components/remove-link";
import { sourceFor } from "@/lib/tracks";

export type AttachmentItem = {
  id: string;
  kind: "FILE" | "LINK";
  name: string;
  url: string | null;
  contentType: string | null;
  size: number | null;
  keyLabel: string | null;
  arrangementName?: string | null;
};

export function attachmentHref(attachment: Pick<AttachmentItem, "id" | "kind" | "url">) {
  return attachment.kind === "FILE" ? `/files/${attachment.id}` : (attachment.url ?? "#");
}

function kindLabel(attachment: AttachmentItem) {
  if (attachment.kind === "LINK") return attachment.url && youtubeId(attachment.url) ? "YouTube" : "Link";
  if (attachment.contentType?.startsWith("audio/")) return "Audio";
  if (attachment.contentType === "application/pdf") return "PDF";
  if (attachment.contentType?.startsWith("image/")) return "Image";
  if (attachment.contentType?.startsWith("text/")) return "Text";
  return "File";
}

export function AttachmentList({ attachments, canEdit, songTitle }: { attachments: AttachmentItem[]; canEdit: boolean; songTitle: string }) {
  // Each recording or video plays on its own from here.
  const tracks = attachments.flatMap((attachment) => {
    const source = sourceFor(attachment);
    return source ? [{ id: attachment.id, title: songTitle, sources: [source] }] : [];
  });

  if (attachments.length === 0) return <p className="muted text-sm">No files or links yet.</p>;

  return (
    <ul className="divide-y divide-black/10 dark:divide-white/10">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="flex items-center gap-3 py-2">
          <span className="badge w-16 shrink-0 justify-center">{kindLabel(attachment)}</span>
          {tracks.some((t) => t.id === attachment.id) && (
            <PlayButton tracks={tracks} index={tracks.findIndex((t) => t.id === attachment.id)} label={`Play ${attachment.name}`} />
          )}
          <div className="min-w-0 flex-1">
            <a href={attachmentHref(attachment)} target="_blank" rel="noopener noreferrer" className="link block truncate text-sm">
              {attachment.name}
            </a>
            <div className="muted truncate text-xs">
              {[
                attachment.keyLabel && `Key of ${attachment.keyLabel}`,
                attachment.arrangementName,
                formatFileSize(attachment.size),
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          {canEdit && attachment.kind === "LINK" && <RemoveLinkButton attachmentId={attachment.id} name={attachment.name} />}
          {canEdit && attachment.kind === "FILE" && (
            <form action={deleteAttachment}>
              <input type="hidden" name="attachmentId" value={attachment.id} />
              <SubmitButton
                className="muted cursor-pointer text-sm hover:text-red-600"
                confirm={`Delete ${attachment.name}? This can't be undone.`}
              >
                Delete
              </SubmitButton>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
