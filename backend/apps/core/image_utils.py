from io import BytesIO
from pathlib import Path

from django.core.files.base import ContentFile
from PIL import Image, ImageOps


def compress_uploaded_image(uploaded_file, max_side=750, jpeg_quality=85):
    """Compress an uploaded image so the longer side does not exceed max_side."""
    uploaded_file.seek(0)
    image = Image.open(uploaded_file)
    image = ImageOps.exif_transpose(image)
    image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)

    has_alpha = image.mode in ('RGBA', 'LA') or (
        image.mode == 'P' and 'transparency' in image.info
    )
    stem = Path(getattr(uploaded_file, 'name', 'image')).stem or 'image'
    buffer = BytesIO()

    if has_alpha:
        target_name = f'{stem}.png'
        image.save(buffer, format='PNG', optimize=True)
    else:
        target_name = f'{stem}.jpg'
        if image.mode != 'RGB':
            image = image.convert('RGB')
        image.save(buffer, format='JPEG', quality=jpeg_quality, optimize=True)

    buffer.seek(0)
    return ContentFile(buffer.read(), name=target_name)