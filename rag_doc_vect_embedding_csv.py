from langchain_ollama import OllamaEmbeddings
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
import os
import pandas as pd
import pdfplumber
import logging

logging.basicConfig(level=logging.DEBUG)

Data_Path = "./data"
DB_Path = "./knowledge_db"
embedding_model = "mxbai-embed-large"

# df_csv = pd.read_csv("./data/dev_csv.csv") #,encoding="latin-1"
df_csv = pd.read_csv("dev_csv(1).csv") #,encoding="latin-1"
#df_excel = pd.read_excel("./data/dev_excel.xlsx")
Ollama_embeddings = OllamaEmbeddings(model = "mxbai-embed-large")

add_documents = os.path.exists(os.path.join(Data_Path))
documents = []
ids = []

def init_directories():
    """初始化必要的目录"""
    try:
        os.makedirs(Data_Path, exist_ok=True)
        os.makedirs(DB_Path, exist_ok=True)
        print("目录初始化完成")
        return True
    except Exception as e:
        print(f"创建目录失败: {str(e)}")
        return False

# 在主程序开始前调用目录初始化
init_directories()

# 创建文档时将id放入metadata
if add_documents:
    logging.info("开始处理文档...")
    for i, row in df_csv.iterrows():
        document = Document(
            page_content=row["Title"] + " " + row["desc"],
            metadata={"rating": row["Rating"], "date": row["Rating1"], "id": str(i)}
        )
        logging.info(f"添加文档 {i}: {document.page_content[:50]}...")
        documents.append(document)

# vectorstore = Chroma.from_documents(
#     collection_name="restaurant_reviews",
#     documents=documents,
#     embedding=Ollama_embeddings,
#     persist_directory=DB_Path
# )
vector_store = Chroma(
    collection_name="restaurant_reviews",
    persist_directory=DB_Path,
    embedding_function=Ollama_embeddings
)
#-------pdf read
# with pdfplumber.open( "./data/Python基础入门到精通 .pdf") as pdf:
#     page = pdf.pages[0]
#     table = page.extract_table()
#     for row in table:
#         df= pd.DataFrame(row[1:], columns=row[0])
#         print(df)

class DocumentProcessor:
    def __init__(self, chunk_size=500, chunk_overlap=50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
    
    def chunk_documents(self, documents):
        """将文档分块并添加元数据"""
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=["\n\n", "\n", "。", ".", " ", ""]
        )
        chunked_docs = []
        for doc in documents:
            chunks = text_splitter.split_documents([doc])
            for i, chunk in enumerate(chunks):
                original_id = doc.metadata.get('id', f'doc_{len(chunked_docs)}')
                chunk.metadata.update({
                    "chunk_id": f"{original_id}_{i}",
                    "chunk_index": i,
                    "original_id": original_id
                })
            chunked_docs.extend(chunks)
        return chunked_docs
    
    def process_and_store(self, documents, vector_store):
        """处理文档并存储到向量库"""
        try:
            chunked_documents = self.chunk_documents(documents)
            new_ids = [doc.metadata["chunk_id"] for doc in chunked_documents]
            
            # 尝试清理已存在的文档
            try:
                vector_store.delete(ids=new_ids)
                print(f"清理了 {len(new_ids)} 个可能重复的文档ID")
            except Exception as e:
                print(f"清理操作跳过（可能是首次运行）: {str(e)}")
            
            # 添加新文档
            vector_store.add_documents(
                documents=chunked_documents,
                ids=new_ids
            )
            print(f"成功添加 {len(chunked_documents)} 个文档块")
            return len(chunked_documents)
            
        except Exception as e:
            print(f"存储文档时出错: {str(e)}")
            raise

def check_ollama_service():
    """检查 Ollama 服务是否运行"""
    import requests
    try:
        response = requests.get("http://localhost:11434/api/version")
        return response.status_code == 200
    except requests.exceptions.ConnectionError:
        return False

def test_vector_search(vector_store):
    """测试向量检索功能"""
    # 创建检索器
    retriever = vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={"k": 3}  # 返回前3个最相关的结果
    )
    
    # 测试查询列表
    test_queries = [
        "Linux系统",
        "招聘流程",
        "4S店要求",
        "Python编程"
    ]
    
    # 执行测试查询
    for query in test_queries:
        print(f"\n正在检索: {query}")
        results = retriever.get_relevant_documents(query)
        
        if not results:
            print("未找到相关结果")
            continue
            
        print(f"找到 {len(results)} 条结果：")
        for i, doc in enumerate(results):
            print(f"\n--- 结果 {i + 1} ---")
            print("内容:", doc.page_content[:100])
            print("元数据:", doc.metadata)

def inspect_vector_store(vector_store):
    """检查向量库内容"""
    try:
        # 获取集合信息
        collection = vector_store._collection
        count = collection.count()
        print(f"\n向量库统计信息:")
        print(f"文档总数: {count}")
        
        if count == 0:
            print("警告：向量库为空")
            return 0
            
        # 获取所有文档
        print("\n文档内容预览:")
        results = vector_store.similarity_search(
            query="",  # 空查询返回所有文档
            k=count    # 获取所有文档
        )
        
        for i, doc in enumerate(results, 1):
            print(f"\n文档 {i}:")
            print(f"内容: {doc.page_content[:100]}...")
            print(f"元数据: {doc.metadata}")
            
        return count
    except Exception as e:
        print(f"查询向量库失败: {str(e)}")
        return 0

def main():
    """主函数"""
    # 检查Ollama服务
    # if not check_ollama_service():
    #     print("错误: Ollama服务未启动！请先运行: ollama serve")
    #     return
    
    try:
        # 检查数据目录
        if not os.path.exists(Data_Path):
            print(f"错误: 数据目录 {Data_Path} 不存在")
            return
            
        # 打印CSV文件信息
        print(f"CSV文件记录数: {len(df_csv)}")
        print("列名:", df_csv.columns.tolist())
        
        # 初始化文档处理器
        processor = DocumentProcessor()
        
        # 处理并存储文档
        if documents:
            doc_count = processor.process_and_store(documents, vector_store)
            print(f"\n成功处理并存储 {doc_count} 个文档块")
            
            # 执行测试查询
            test_vector_search(vector_store)
        else:
            print("警告: 没有找到要处理的文档")
            
    except Exception as e:
        print(f"程序运行出错: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()

print(f" ------------- df_csv inserted: {len(df_csv)}  ")