from utils.data_loader import load_single_transaction
from llm.llm_explainer import generate_explanation


def main():

    file_path = r"C:\Users\Naga Siddhard M\OneDrive - AlgoLeap Technologies Pvt Ltd\Desktop\Solenis\OTIF(llma_reasoning)\data\OTIF_Row_1.xlsx"

    transaction = load_single_transaction(file_path)

    explanation = generate_explanation(transaction)

    print("\n========== OTIF EXPLANATION ==========\n")

    print(explanation)


if __name__ == "__main__":
    main()