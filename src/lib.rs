use wasm_bindgen::prelude::*;

const INPUT_BUFFER_CAPACITY: usize = 262;

#[repr(u8)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum FileTypeKind {
    Png = 1,
    Jpeg = 2,
    Gif = 3,
    Pdf = 4,
    Zip = 5,
    Webp = 6,
    Wasm = 7,
    Gzip = 8,
    Bmp = 9,
    Tar = 10,
}

impl FileTypeKind {
    fn code(self) -> u8 {
        self as u8
    }
}

static mut INPUT_BUFFER: [u8; INPUT_BUFFER_CAPACITY] = [0; INPUT_BUFFER_CAPACITY];

fn has_signature(bytes: &[u8], offset: usize, signature: &[u8]) -> bool {
    let end = offset.saturating_add(signature.len());
    matches!(bytes.get(offset..end), Some(window) if window == signature)
}

fn detect_kind(bytes: &[u8]) -> Option<FileTypeKind> {
    match bytes.first().copied()? {
        0x89 if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => Some(FileTypeKind::Png),
        0xff if bytes.starts_with(b"\xff\xd8\xff") => Some(FileTypeKind::Jpeg),
        b'G' if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") => {
            Some(FileTypeKind::Gif)
        }
        b'%' if bytes.starts_with(b"%PDF-") => Some(FileTypeKind::Pdf),
        b'P' if bytes.starts_with(b"PK\x03\x04")
            || bytes.starts_with(b"PK\x05\x06")
            || bytes.starts_with(b"PK\x07\x08") =>
        {
            Some(FileTypeKind::Zip)
        }
        b'R' if bytes.starts_with(b"RIFF") && has_signature(bytes, 8, b"WEBP") => {
            Some(FileTypeKind::Webp)
        }
        0x00 if bytes.starts_with(b"\0asm") => Some(FileTypeKind::Wasm),
        0x1f if bytes.starts_with(b"\x1f\x8b") => Some(FileTypeKind::Gzip),
        b'B' if bytes.starts_with(b"BM") => Some(FileTypeKind::Bmp),
        _ if has_signature(bytes, 257, b"ustar") => Some(FileTypeKind::Tar),
        _ => None,
    }
}

#[wasm_bindgen(js_name = inputBufferCapacity)]
pub fn input_buffer_capacity() -> usize {
    INPUT_BUFFER_CAPACITY
}

#[wasm_bindgen(js_name = inputBufferPointer)]
pub fn input_buffer_pointer() -> usize {
    std::ptr::addr_of_mut!(INPUT_BUFFER) as *mut u8 as usize
}

#[wasm_bindgen(js_name = detectFileTypeCodeFromInput)]
pub fn detect_file_type_code_from_input(length: usize) -> u8 {
    let length = length.min(INPUT_BUFFER_CAPACITY);
    let bytes = unsafe {
        std::slice::from_raw_parts(std::ptr::addr_of!(INPUT_BUFFER) as *const u8, length)
    };

    detect_kind(bytes).map_or(0, FileTypeKind::code)
}

#[cfg(test)]
mod tests {
    use super::{
        detect_file_type_code_from_input, detect_kind, input_buffer_capacity, input_buffer_pointer,
        FileTypeKind,
    };

    fn write_input_buffer(bytes: &[u8]) -> usize {
        let length = bytes.len().min(input_buffer_capacity());

        unsafe {
            std::ptr::copy_nonoverlapping(
                bytes.as_ptr(),
                input_buffer_pointer() as *mut u8,
                length,
            );
        }

        length
    }

    #[test]
    fn detects_png_files() {
        let bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        assert_eq!(detect_kind(&bytes), Some(FileTypeKind::Png));
    }

    #[test]
    fn detects_webp_files() {
        let bytes = [
            0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
        ];
        assert_eq!(detect_kind(&bytes), Some(FileTypeKind::Webp));
    }

    #[test]
    fn detects_tar_files() {
        let mut bytes = [0_u8; 262];
        bytes[257..262].copy_from_slice(b"ustar");
        assert_eq!(detect_kind(&bytes), Some(FileTypeKind::Tar));
    }

    #[test]
    fn reports_the_input_buffer_capacity() {
        assert_eq!(input_buffer_capacity(), 262);
    }

    #[test]
    fn returns_numeric_code_for_detected_types_from_the_input_buffer() {
        let jpeg_bytes = [0xff, 0xd8, 0xff, 0x00];

        assert_eq!(
            detect_file_type_code_from_input(write_input_buffer(&jpeg_bytes)),
            FileTypeKind::Jpeg.code()
        );
    }

    #[test]
    fn returns_zero_for_unknown_bytes_from_the_input_buffer() {
        let bytes = [0x12, 0x34, 0x56, 0x78];

        assert_eq!(detect_kind(&bytes), None);
        assert_eq!(
            detect_file_type_code_from_input(write_input_buffer(&bytes)),
            0
        );
    }
}
