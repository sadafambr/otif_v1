import pandas as pd

def load_single_transaction(file_path):
    
    df = pd.read_excel(file_path)

    if len(df) == 0:
        raise Exception("Excel file is empty")

    if len(df) > 1:
        raise Exception("Excel must contain only ONE row")

    row = df.iloc[0]

    return row.to_dict()