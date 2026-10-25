import { useCallback, useEffect, useState } from "react";

const POLL_MS = 450;
/** A phone is considered offline if no new frame arrived for this long. */
const OFFLINE_AFTER_MS = 3500;

export type SceneSource = "phone" | "upload" | "none";

/**
 * Supplies the scene image: frames streamed from the phone via the server
 * relay, or an uploaded photo (which takes over until cleared).
 */
export function useSceneFrame() {
  const [phoneUrl, setPhoneUrl] = useState<string | null>(null);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [phoneOnline, setPhoneOnline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let lastId = 0;
    let lastFrameAt = 0;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const response = await fetch(`/api/scene/frame?since=${lastId}`, { cache: "no-store" });
        if (response.status === 200 && !cancelled) {
          lastId = Number(response.headers.get("x-frame-id")) || lastId;
          lastFrameAt = Date.now();
          const url = URL.createObjectURL(await response.blob());
          setPhoneUrl((previous) => {
            if (previous) URL.revokeObjectURL(previous);
            return url;
          });
        }
      } catch {
        // The relay is unreachable; the offline flag below reflects it.
      }
      if (cancelled) return;
      setPhoneOnline(Date.now() - lastFrameAt < OFFLINE_AFTER_MS);
      timer = setTimeout(poll, POLL_MS);
    };
    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setPhoneUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    };
  }, []);

  const setUpload = useCallback((file: File | null) => {
    setUploadUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : null;
    });
  }, []);

  useEffect(() => () => {
    setUploadUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }, []);

  const source: SceneSource = uploadUrl ? "upload" : phoneUrl && phoneOnline ? "phone" : "none";
  return { src: source === "upload" ? uploadUrl : source === "phone" ? phoneUrl : null, source, setUpload };
}
