import React, { useEffect, useState } from "react";
import { resolveAssetPreviewUrl } from "@/lib/protected-file";

type MediaKind = "image" | "audio" | "video";

type Props = {
  kind: MediaKind;
  url: string | null | undefined;
  name?: string;
  className?: string;
  style?: React.CSSProperties;
  controls?: boolean;
  alt?: string;
  title?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
};

/**
 * Render uploaded media only after the server issues an owner-bound preview URL.
 * This is important in Cloud Preview: media elements cannot attach the custom
 * session header used by fetch(), and third-party cookie blocking can otherwise
 * turn an otherwise valid protected file into a 401 response.
 */
export default function ProtectedAssetMedia({
  kind,
  url,
  name,
  className,
  style,
  controls = true,
  alt,
  title,
  onClick,
}: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setPreviewUrl(null);
    setFailed(false);
    if (!url) return () => { active = false; };

    void resolveAssetPreviewUrl(url)
      .then(value => {
        if (active) setPreviewUrl(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => { active = false; };
  }, [url]);

  const common = {
    className,
    style,
    title,
    onClick,
    onError: () => setFailed(true),
  };

  if (!previewUrl || failed) {
    return (
      <div
        className={className}
        style={{
          ...style,
          display: "grid",
          placeItems: "center",
          minHeight: 44,
          padding: 10,
          borderRadius: 10,
          color: "#9BAABE",
          background: "#0B1522",
          fontSize: 11,
          textAlign: "center",
        }}
        role="status"
      >
        {failed ? "تعذر تحميل المعاينة داخل الصفحة." : "جارٍ تجهيز المعاينة…"}
      </div>
    );
  }

  if (kind === "image") {
    return <img {...common} src={previewUrl} alt={alt || name || "ملف مرفق"} />;
  }
  if (kind === "video") {
    return <video {...common} src={previewUrl} controls={controls} />;
  }
  return <audio {...common} src={previewUrl} controls={controls} />;
}
