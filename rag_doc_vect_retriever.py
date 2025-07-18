from langchain_ollama import OllamaEmbeddings
from langchain_chroma import Chroma
from langchain_core.documents import Document
import os
import pandas as pd
import pdfplumber
import logging
from rag_doc_vect_embedding_csv import DocumentProcessor  # 导入DocumentProcessor类

logging.basicConfig(level=logging.DEBUG)

Data_Path = "./data"
DB_Path = "./knowledge_db"
embedding_model = "mxbai-embed-large"


# df_csv = pd.read_csv("./data/dev_csv.csv")  # ,encoding="latin-1"
df_csv = pd.read_csv("dev_csv(1).csv")  # ,encoding="latin-1"
ollama_embeddings = OllamaEmbeddings(model="mxbai-embed-large")

add_documents = not os.path.exists(os.path.join(DB_Path))

# 验证CSV文件列名
print("CSV文件的列名:", df_csv.columns.tolist())

required_columns = ["Title", "desc", "Rating", "Rating1"]
missing_columns = [col for col in required_columns if col not in df_csv.columns]

if missing_columns:
    raise ValueError(f"CSV文件缺少必要的列: {missing_columns}")

if add_documents:
    documents = []
    ids = []
    for i, row in df_csv.iterrows():
        try:
            document = Document(
                page_content=row["Title"] + " " + row["desc"],
                metadata={"rating": row["Rating"], "date": row["Rating1"]},
                id=str(i)
            )
            logging.info(f"添加文档 {i}: {document.page_content[:50]}...")
            ids.append(str(i))
            documents.append(document)
        except KeyError as e:
            logging.error(f"列名错误: {e}, 当前行: {i}")
            continue

    # 使用DocumentProcessor处理文档
    processor = DocumentProcessor()
    chunked_documents = processor.chunk_documents(documents)
else:
    chunked_documents = []

vector_store = Chroma(
    collection_name="restaurant_reviews",
    persist_directory=DB_Path,
    embedding_function=ollama_embeddings
)

if add_documents and chunked_documents:
    vector_store.add_documents(documents=chunked_documents, ids=[doc.metadata["chunk_id"] for doc in chunked_documents])

retriever = vector_store.as_retriever(
    search_type="similarity",
    search_kwargs={"k": 3}
)


# ==========================================================
# 作者: 郑臣亮
# 时间: 2025-07-18
# 功能: 主函数入口，测试向量检索功能。可根据实际需求修改查询内容。
#      运行后会输出检索到的文档内容及其分块信息。
# ==========================================================
def main():
    while True:
        query = input("\n请输入检索问题（输入'q'退出）: ")
        if query.lower() == 'q':
            break
            
        if not query.strip():
            print("查询内容不能为空！")
            continue
            
        print(f"\n正在检索: {query}")
        results = retriever.get_relevant_documents(query)
        
        if not results:
            print("未找到相关结果，请尝试其他关键词")
            continue
            
        print(f"\n检索到 {len(results)} 条结果：")
        for i, doc in enumerate(results):
            print(f"\n--- 结果 {i + 1} ---")
            print("内容片段：", doc.page_content[:100])
            print("相关度：", doc.metadata.get('score', 'N/A'))
            print("文档ID：", doc.metadata.get('chunk_id', 'N/A'))


def check_vector_store():
    """检查向量存储状态"""
    try:
        collection = vector_store._collection
        count = collection.count()
        print(f"\n当前向量库中存储的文档数量: {count}")
        
        if count == 0:
            print("警告：向量库为空，请检查文档是否正确添加")
            return False
        return True
    except Exception as e:
        print(f"检查向量库状态失败: {str(e)}")
        return False


# 在main函数开始前调用
if __name__ == "__main__":
    if not check_vector_store():
        print("向量库状态异常，程序退出")
        exit(1)
    main()