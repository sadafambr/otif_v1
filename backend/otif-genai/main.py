import os
from utils.data_loader import load_single_transaction
from llm.llm_explainer import generate_explanation
from utils.logger import get_logger

logger = get_logger(__name__)

def main():
    file_path = os.getenv("OTIF_TEST_FILE", r"C:\Users\Naga Siddhard M\OneDrive - AlgoLeap Technologies Pvt Ltd\Desktop\Solenis\OTIF(llma_reasoning)\data\OTIF_Row_1.xlsx")
    
    logger.info("Starting OTIF explanation generation process", extra={"file_path": file_path})
    try:
        transaction = load_single_transaction(file_path)
        explanation = generate_explanation(transaction)
        logger.info("========== OTIF EXPLANATION ==========")
        logger.info(explanation)
    except Exception as e:
        logger.error("Error during OTIF explanation generation", exc_info=True)

if __name__ == "__main__":
    main()