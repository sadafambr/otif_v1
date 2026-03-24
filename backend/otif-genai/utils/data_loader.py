import pandas as pd
from typing import Dict, Any
import os
from utils.logger import get_logger

logger = get_logger(__name__)

def load_single_transaction(file_path: str) -> Dict[str, Any]:
    logger.info("Loading single transaction", extra={"file_path": file_path})
    if not os.path.exists(file_path):
        logger.error("File not found", extra={"file_path": file_path})
        raise FileNotFoundError(f"File not found: {file_path}")

    try:
        df = pd.read_excel(file_path)
    except Exception as e:
        logger.error("Failed to read Excel file", exc_info=True, extra={"file_path": file_path})
        raise ValueError(f"Failed to read Excel file: {str(e)}") from e

    if len(df) == 0:
        logger.error("Excel file is empty", extra={"file_path": file_path})
        raise ValueError("Excel file is empty")

    if len(df) > 1:
        logger.warning("Excel contains more than one row, only first row will be processed", extra={"row_count": len(df), "file_path": file_path})

    row = df.iloc[0]
    logger.debug("Successfully loaded transaction row")
    return row.to_dict()