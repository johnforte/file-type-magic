use wasm_bindgen::prelude::*;

fn has_signature(bytes: &[u8], offset: usize, signature: &[u8]) -> bool {
    let end = offset.saturating_add(signature.len());
    matches!(bytes.get(offset..end), Some(window) if window == signature)
}

fn detect_kind(bytes: &[u8]) -> Option<&'static str> {
    match bytes.first().copied()? {
        0x89 if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => Some("png"),
        0xff if bytes.starts_with(b"\xff\xd8\xff") => Some("jpeg"),
        b'G' if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") => Some("gif"),
        b'%' if bytes.starts_with(b"%PDF-") => Some("pdf"),
        b'P' if bytes.starts_with(b"PK\x03\x04")
            || bytes.starts_with(b"PK\x05\x06")
            || bytes.starts_with(b"PK\x07\x08") =>
        {
            Some("zip")
        }
        b'R' if bytes.starts_with(b"RIFF") && has_signature(bytes, 8, b"WEBP") => Some("webp"),
        0x00 if bytes.starts_with(b"\0asm") => Some("wasm"),
        0x1f if bytes.starts_with(b"\x1f\x8b") => Some("gzip"),
        b'B' if bytes.starts_with(b"BM") => Some("bmp"),
        _ if has_signature(bytes, 257, b"ustar") => Some("tar"),
        _ => None,
    }
}

fn matches_alias(expected: &str, aliases: &[&str]) -> bool {
    aliases
        .iter()
        .any(|alias| expected.eq_ignore_ascii_case(alias))
}

fn normalize_expected(expected: &str) -> Option<&'static str> {
    let expected = expected.trim();
    if expected.is_empty() {
        return None;
    }

    let expected = expected.strip_prefix('.').unwrap_or(expected);

    if matches_alias(expected, &["png", "image/png"]) {
        Some("png")
    } else if matches_alias(
        expected,
        &["jpeg", "jpg", "image/jpeg", "image/jpg", "image/pjpeg"],
    ) {
        Some("jpeg")
    } else if matches_alias(expected, &["gif", "image/gif"]) {
        Some("gif")
    } else if matches_alias(expected, &["pdf", "application/pdf"]) {
        Some("pdf")
    } else if matches_alias(
        expected,
        &["zip", "application/zip", "application/x-zip-compressed"],
    ) {
        Some("zip")
    } else if matches_alias(expected, &["webp", "image/webp"]) {
        Some("webp")
    } else if matches_alias(expected, &["wasm", "application/wasm"]) {
        Some("wasm")
    } else if matches_alias(
        expected,
        &[
            "gzip",
            "gz",
            "application/gzip",
            "application/x-gzip",
            "application/x-gunzip",
        ],
    ) {
        Some("gzip")
    } else if matches_alias(expected, &["bmp", "image/bmp", "image/x-ms-bmp"]) {
        Some("bmp")
    } else if matches_alias(expected, &["tar", "application/x-tar", "application/tar"]) {
        Some("tar")
    } else {
        None
    }
}

#[wasm_bindgen(js_name = detectFileType)]
pub fn detect_file_type(bytes: &[u8]) -> Option<String> {
    detect_kind(bytes).map(str::to_owned)
}

#[wasm_bindgen(js_name = matchesFileType)]
pub fn matches_file_type(bytes: &[u8], expected: &str) -> bool {
    detect_kind(bytes)
        .zip(normalize_expected(expected))
        .is_some_and(|(kind, expected)| kind == expected)
}

#[wasm_bindgen(js_name = isSupportedFile)]
pub fn is_supported_file(bytes: &[u8]) -> bool {
    detect_kind(bytes).is_some()
}

#[cfg(test)]
mod tests {
    use super::{detect_kind, matches_file_type};

    #[test]
    fn detects_png_files() {
        let bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        assert_eq!(detect_kind(&bytes), Some("png"));
    }

    #[test]
    fn detects_webp_files() {
        let bytes = [
            0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
        ];
        assert_eq!(detect_kind(&bytes), Some("webp"));
    }

    #[test]
    fn detects_tar_files() {
        let mut bytes = [0_u8; 262];
        bytes[257..262].copy_from_slice(b"ustar");
        assert_eq!(detect_kind(&bytes), Some("tar"));
    }

    #[test]
    fn matches_expected_types_with_aliases_and_mime_types() {
        let jpeg_bytes = [0xff, 0xd8, 0xff, 0x00];
        assert!(matches_file_type(&jpeg_bytes, "jpg"));
        assert!(matches_file_type(&jpeg_bytes, " image/jpeg "));
        assert!(matches_file_type(&jpeg_bytes, "image/jpg"));
    }

    #[test]
    fn matches_dot_prefixed_extensions() {
        let png_bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        assert!(matches_file_type(&png_bytes, ".PNG"));
    }

    #[test]
    fn matches_nonstandard_gzip_mime_type() {
        let gzip_bytes = [0x1f, 0x8b, 0x08];
        assert!(matches_file_type(&gzip_bytes, "application/x-gzip"));
    }

    #[test]
    fn rejects_unknown_expected_types() {
        let png_bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        assert!(!matches_file_type(&png_bytes, "application/json"));
        assert!(!matches_file_type(&png_bytes, "   "));
    }

    #[test]
    fn returns_none_for_unknown_bytes() {
        let bytes = [0x12, 0x34, 0x56, 0x78];
        assert_eq!(detect_kind(&bytes), None);
    }
}
