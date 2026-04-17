use wasm_bindgen::prelude::*;

fn has_signature(bytes: &[u8], offset: usize, signature: &[u8]) -> bool {
    let end = offset.saturating_add(signature.len());
    bytes.len() >= end && &bytes[offset..end] == signature
}

fn detect_kind(bytes: &[u8]) -> Option<&'static str> {
    if has_signature(bytes, 0, b"\x89PNG\r\n\x1a\n") {
        return Some("png");
    }

    if has_signature(bytes, 0, b"\xff\xd8\xff") {
        return Some("jpeg");
    }

    if has_signature(bytes, 0, b"GIF87a") || has_signature(bytes, 0, b"GIF89a") {
        return Some("gif");
    }

    if has_signature(bytes, 0, b"%PDF-") {
        return Some("pdf");
    }

    if has_signature(bytes, 0, b"PK\x03\x04")
        || has_signature(bytes, 0, b"PK\x05\x06")
        || has_signature(bytes, 0, b"PK\x07\x08")
    {
        return Some("zip");
    }

    if has_signature(bytes, 0, b"RIFF") && has_signature(bytes, 8, b"WEBP") {
        return Some("webp");
    }

    if has_signature(bytes, 0, b"\0asm") {
        return Some("wasm");
    }

    if has_signature(bytes, 0, b"\x1f\x8b") {
        return Some("gzip");
    }

    if has_signature(bytes, 0, b"BM") {
        return Some("bmp");
    }
    
    if has_signature(bytes, 257, b"ustar") {
        return Some("tar");
    }

    None
}

#[wasm_bindgen(js_name = detectFileType)]
pub fn detect_file_type(bytes: &[u8]) -> Option<String> {
    detect_kind(bytes).map(str::to_owned)
}

#[wasm_bindgen(js_name = matchesFileType)]
pub fn matches_file_type(bytes: &[u8], expected: &str) -> bool {
    detect_kind(bytes).is_some_and(|kind| kind.eq_ignore_ascii_case(expected.trim()))
}

#[wasm_bindgen(js_name = isSupportedFile)]
pub fn is_supported_file(bytes: &[u8]) -> bool {
    detect_kind(bytes).is_some()
}

#[cfg(test)]
mod tests {
    use super::detect_kind;

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
    fn returns_none_for_unknown_bytes() {
        let bytes = [0x12, 0x34, 0x56, 0x78];
        assert_eq!(detect_kind(&bytes), None);
    }
}
