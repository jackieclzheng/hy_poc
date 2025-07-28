from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import sys

# 导入您现有的Python模块
from rag_doc_vect_embedding_csv import vector_store, df_csv
from rag_doc_vect_retriever import retriever
from rag_doc_vect_agent_main import chain

app = FastAPI(title="现代汽车智能客服API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    question: str

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "现代汽车智能客服API"}

@app.post("/api/chat/send")
async def send_message(request: QueryRequest):
    try:
        reviews = retriever.invoke(request.question)
        result = chain.invoke({"reviews": reviews, "question": request.question})
        return {
            "answer": result,
            "reviews": [doc.page_content for doc in reviews],
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/retriever/stats")
async def get_vector_stats():
    try:
        collection = vector_store._collection
        count = collection.count()
        return {
            "document_count": count,
            "csv_records": len(df_csv),
            "status": "active"
        }
    except Exception as e:
        return {"document_count": 0, "csv_records": 0, "status": "error"}

@app.post("/api/retriever/test")
async def test_retriever(request: QueryRequest):
    try:
        results = retriever.get_relevant_documents(request.question)
        return {
            "query": request.question,
            "results": [{"content": doc.page_content, "metadata": doc.metadata} for doc in results],
            "count": len(results),
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        os.makedirs("./data", exist_ok=True)
        file_path = f"./data/{file.filename}"
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        return {"filename": file.filename, "status": "uploaded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/system/info")
async def get_system_info():
    return {
        "python_files": {
            "embedding": os.path.exists("rag_doc_vect_embedding_csv.py"),
            "retriever": os.path.exists("rag_doc_vect_retriever.py"),
            "agent": os.path.exists("rag_doc_vect_agent_main.py")
        },
        "data_files": {
            "csv_file": os.path.exists("dev_csv(1).csv"),
            "data_dir": os.path.exists("data"),
            "knowledge_db": os.path.exists("knowledge_db")
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)