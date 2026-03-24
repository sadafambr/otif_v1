import logging
import json
import traceback
from datetime import datetime
from typing import Any, Dict

class JSONFormatter(logging.Formatter):
    """Custom formatter to output structured JSON logs."""
    
    def format(self, record: logging.LogRecord) -> str:
        log_obj: Dict[str, Any] = {
            "timestamp": datetime.utcfromtimestamp(record.created).isoformat() + "Z",
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "filename": record.filename,
            "lineno": record.lineno,
        }
        
        if record.exc_info:
            log_obj["exception"] = "".join(traceback.format_exception(*record.exc_info))
            
        if hasattr(record, "request_id"):
            log_obj["request_id"] = record.request_id

        # Merge extra kwargs
        for key, value in record.__dict__.items():
            if key not in ["args", "asctime", "created", "exc_info", "exc_text", "filename", "funcName", "id", "levelname", "levelno", "lineno", "module", "msecs", "message", "msg", "name", "pathname", "process", "processName", "relativeCreated", "stack_info", "thread", "threadName"]:
                log_obj[key] = value

        return json.dumps(log_obj)

def get_logger(name: str) -> logging.Logger:
    """Gets a structured JSON logger."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler()
        handler.setFormatter(JSONFormatter())
        logger.addHandler(handler)
        logger.propagate = False
    return logger
