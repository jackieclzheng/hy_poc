from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import sys
import pandas as pd
import json
import logging
from datetime import datetime
from typing import List, Optional, Dict
import hashlib
import asyncio
from pathlib import Path
import uuid

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 导入您现有的RAG模块
try:
    from rag_doc_vect_embedding_csv import (
        vector_store, df_csv, Ollama_embeddings, 
        DocumentProcessor, init_directories
    )
    from rag_doc_vect_retriever import retriever
    from rag_doc_vect_agent_main import LLMModel, chain
    
    RAG_AVAILABLE = True
    logger.info("✅ RAG系统模块加载成功")
except ImportError as e:
    logger.error(f"❌ RAG模块导入失败: {e}")
    RAG_AVAILABLE = False

app = FastAPI(
    title="现代汽车智能客服API",
    description="基于RAG技术的智能客服系统",
    version="2024.1"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== 数据模型定义 =====
class QueryRequest(BaseModel):
    question: str

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    stream: bool = False

class KnowledgeBaseCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    chunk_method: Optional[str] = "naive"
    chunk_size: Optional[int] = 512
    chunk_overlap: Optional[int] = 50

class DocumentInfo(BaseModel):
    name: str
    content: str
    metadata: Optional[dict] = {}

# ===== 全局变量 =====
knowledge_bases = {}  # 存储知识库信息
documents_storage = {}  # 存储文档信息
current_kb_id = "default_kb"  # 当前活跃的知识库ID
chat_tasks: Dict[str, dict] = {}  # 存储聊天任务状态

# ===== 初始化函数 =====
async def initialize_system():
    """初始化系统"""
    try:
        if RAG_AVAILABLE:
            # 初始化目录
            init_directories()
            
            # 创建默认知识库
            knowledge_bases["default_kb"] = {
                "id": "default_kb",
                "name": "现代汽车主知识库",
                "description": "包含现有CSV数据的知识库",
                "chunk_method": "naive",
                "chunk_size": 512,
                "chunk_overlap": 50,
                "document_count": 1,
                "chunk_count": len(df_csv) if 'df_csv' in globals() else 0,
                "status": "active",
                "created_at": datetime.now().isoformat()
            }
            
            # 添加CSV文档信息
            documents_storage["csv_data"] = {
                "id": "csv_data",
                "name": "dev_csv(1).csv",
                "kb_id": "default_kb",
                "size": f"{len(df_csv)} 条记录" if 'df_csv' in globals() else "0 条记录",
                "status": "completed",
                "chunk_num": len(df_csv) if 'df_csv' in globals() else 0,
                "created_at": datetime.now().isoformat(),
                "type": "csv"
            }
            
            logger.info("✅ 系统初始化完成")
        else:
            logger.warning("⚠️ RAG系统不可用，使用模拟模式")
            
    except Exception as e:
        logger.error(f"❌ 系统初始化失败: {e}")

# ===== 辅助函数 =====
def generate_kb_id(name: str) -> str:
    """生成知识库ID"""
    return f"kb_{hashlib.md5(name.encode()).hexdigest()[:8]}"

def generate_doc_id(filename: str) -> str:
    """生成文档ID"""
    return f"doc_{hashlib.md5(filename.encode()).hexdigest()[:8]}"

async def process_csv_to_vector_store(csv_path: str, kb_id: str):
    """处理CSV文件并添加到向量库"""
    try:
        if not RAG_AVAILABLE:
            return False
            
        # 读取CSV文件
        df = pd.read_csv(csv_path, encoding='utf-8')
        logger.info(f"📄 读取CSV文件: {len(df)} 行数据")
        
        # 创建文档处理器
        processor = DocumentProcessor()
        documents = []
        
        # 将CSV行转换为文档
        for i, row in df.iterrows():
            try:
                # 构建文档内容
                content = ""
                if 'Title' in row and pd.notna(row['Title']):
                    content += f"标题: {row['Title']}\n"
                if 'desc' in row and pd.notna(row['desc']):
                    content += f"描述: {row['desc']}\n"
                
                # 添加其他列
                for col in df.columns:
                    if col not in ['Title', 'desc'] and pd.notna(row[col]):
                        content += f"{col}: {row[col]}\n"
                
                if content.strip():
                    from langchain_core.documents import Document
                    document = Document(
                        page_content=content.strip(),
                        metadata={
                            "source": csv_path,
                            "row_id": i,
                            "kb_id": kb_id,
                            "type": "csv_row"
                        }
                    )
                    documents.append(document)
                    
            except Exception as e:
                logger.warning(f"⚠️ 处理第{i}行时出错: {e}")
                continue
        
        if documents:
            # 使用DocumentProcessor处理文档
            processor.process_and_store(documents, vector_store)
            logger.info(f"✅ 成功处理 {len(documents)} 个文档")
            return True
        else:
            logger.warning("⚠️ 没有有效的文档内容")
            return False
            
    except Exception as e:
        logger.error(f"❌ 处理CSV文件失败: {e}")
        return False

# ===== 系统API =====
@app.get("/api/system/status")
async def system_status():
    """系统状态检查"""
    try:
        status_info = {
            "status": "healthy",
            "service": "现代汽车智能助手",
            "version": "2024.1",
            "rag_available": RAG_AVAILABLE,
            "total_knowledge_bases": len(knowledge_bases),
            "total_documents": len(documents_storage)
        }
        
        if RAG_AVAILABLE:
            try:
                # 检查向量库状态
                collection = vector_store._collection
                document_count = collection.count()
                status_info.update({
                    "mode": "production",
                    "vector_store_documents": document_count,
                    "csv_records": len(df_csv) if 'df_csv' in globals() else 0
                })
            except Exception as e:
                logger.warning(f"向量库检查失败: {e}")
                status_info["mode"] = "limited"
        else:
            status_info["mode"] = "mock"
        
        return {
            "success": True,
            "code": 200,
            "message": "系统运行正常",
            "data": status_info
        }
    except Exception as e:
        return {
            "success": False,
            "code": 500,
            "message": f"系统检查失败: {str(e)}",
            "data": None
        }

# ===== 知识库管理API =====
@app.get("/api/v1/datasets")
async def get_datasets(page: int = 1, page_size: int = 30):
    """获取知识库列表"""
    try:
        kb_list = list(knowledge_bases.values())
        
        # 分页处理
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_kbs = kb_list[start_idx:end_idx]
        
        return {
            "code": 0,
            "message": "success",
            "data": paginated_kbs,
            "total": len(kb_list),
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        logger.error(f"获取知识库列表失败: {e}")
        return {
            "code": 500,
            "message": f"获取知识库失败: {str(e)}",
            "data": []
        }

@app.post("/api/v1/datasets")
async def create_dataset(background_tasks: BackgroundTasks, request: KnowledgeBaseCreate):
    """创建知识库"""
    try:
        kb_id = generate_kb_id(request.name)
        
        # 检查是否已存在
        if kb_id in knowledge_bases:
            return {
                "code": 400,
                "message": "知识库名称已存在",
                "data": None
            }
        
        # 创建知识库记录
        new_kb = {
            "id": kb_id,
            "name": request.name,
            "description": request.description,
            "chunk_method": request.chunk_method,
            "chunk_size": request.chunk_size,
            "chunk_overlap": request.chunk_overlap,
            "document_count": 0,
            "chunk_count": 0,
            "status": "active",
            "created_at": datetime.now().isoformat()
        }
        
        knowledge_bases[kb_id] = new_kb
        logger.info(f"✅ 创建知识库: {request.name} (ID: {kb_id})")
        
        return {
            "code": 0,
            "message": "创建成功",
            "data": new_kb
        }
    except Exception as e:
        logger.error(f"创建知识库失败: {e}")
        return {
            "code": 500,
            "message": f"创建知识库失败: {str(e)}",
            "data": None
        }

@app.delete("/api/v1/datasets/{dataset_id}")
async def delete_dataset(dataset_id: str):
    """删除知识库"""
    try:
        if dataset_id not in knowledge_bases:
            return {
                "code": 404,
                "message": "知识库不存在",
                "data": None
            }
        
        # 删除相关文档
        docs_to_delete = [doc_id for doc_id, doc in documents_storage.items() 
                         if doc.get("kb_id") == dataset_id]
        
        for doc_id in docs_to_delete:
            del documents_storage[doc_id]
        
        # 删除知识库
        kb_name = knowledge_bases[dataset_id]["name"]
        del knowledge_bases[dataset_id]
        
        logger.info(f"🗑️ 删除知识库: {kb_name} 及 {len(docs_to_delete)} 个文档")
        
        return {
            "code": 0,
            "message": "删除成功",
            "data": None
        }
    except Exception as e:
        logger.error(f"删除知识库失败: {e}")
        return {
            "code": 500,
            "message": f"删除失败: {str(e)}",
            "data": None
        }

# ===== 文档管理API =====
@app.get("/api/v1/datasets/{dataset_id}/documents")
async def get_documents(dataset_id: str, page: int = 1, page_size: int = 30, keywords: str = ""):
    """获取文档列表"""
    try:
        if dataset_id not in knowledge_bases:
            return {
                "code": 404,
                "message": "知识库不存在",
                "data": []
            }
        
        # 筛选属于该知识库的文档
        kb_documents = [doc for doc in documents_storage.values() 
                       if doc.get("kb_id") == dataset_id]
        
        # 关键词过滤
        if keywords:
            kb_documents = [doc for doc in kb_documents 
                           if keywords.lower() in doc["name"].lower()]
        
        # 分页
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_docs = kb_documents[start_idx:end_idx]
        
        return {
            "code": 0,
            "message": "success",
            "data": paginated_docs,
            "total": len(kb_documents),
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        logger.error(f"获取文档列表失败: {e}")
        return {
            "code": 500,
            "message": f"获取文档失败: {str(e)}",
            "data": []
        }

@app.post("/api/v1/datasets/{dataset_id}/documents")
async def upload_document(dataset_id: str, background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """上传文档"""
    try:
        if dataset_id not in knowledge_bases:
            return {
                "code": 404,
                "message": "知识库不存在",
                "data": None
            }
        
        # 检查文件类型
        allowed_extensions = {'.pdf', '.docx', '.txt', '.csv', '.xlsx'}
        file_extension = Path(file.filename).suffix.lower()
        
        if file_extension not in allowed_extensions:
            return {
                "code": 400,
                "message": f"不支持的文件类型: {file_extension}",
                "data": None
            }
        
        # 保存文件
        os.makedirs("./data", exist_ok=True)
        file_path = f"./data/{file.filename}"
        
        content = await file.read()
        with open(file_path, "wb") as buffer:
            buffer.write(content)
        
        # 创建文档记录
        doc_id = generate_doc_id(file.filename)
        doc_info = {
            "id": doc_id,
            "name": file.filename,
            "kb_id": dataset_id,
            "file_path": file_path,
            "size": f"{len(content)} bytes",
            "status": "processing",
            "chunk_num": 0,
            "created_at": datetime.now().isoformat(),
            "type": file_extension[1:]  # 去掉点号
        }
        
        documents_storage[doc_id] = doc_info
        
        # 异步处理文档
        if RAG_AVAILABLE:
            background_tasks.add_task(process_uploaded_document, doc_id, file_path, dataset_id)
        
        # 更新知识库文档计数
        knowledge_bases[dataset_id]["document_count"] += 1
        
        logger.info(f"📁 上传文档: {file.filename} 到知识库 {dataset_id}")
        
        return {
            "code": 0,
            "message": "上传成功，正在处理中",
            "data": doc_info
        }
    except Exception as e:
        logger.error(f"上传文档失败: {e}")
        return {
            "code": 500,
            "message": f"上传失败: {str(e)}",
            "data": None
        }

async def process_uploaded_document(doc_id: str, file_path: str, kb_id: str):
    """后台处理上传的文档"""
    try:
        logger.info(f"🔄 开始处理文档: {doc_id}")
        
        file_extension = Path(file_path).suffix.lower()
        
        if file_extension == '.csv':
            # 处理CSV文件
            success = await process_csv_to_vector_store(file_path, kb_id)
            
            if success:
                # 更新CSV记录数
                df = pd.read_csv(file_path)
                documents_storage[doc_id]["chunk_num"] = len(df)
                documents_storage[doc_id]["status"] = "completed"
                
                # 更新知识库切片计数
                knowledge_bases[kb_id]["chunk_count"] += len(df)
            else:
                documents_storage[doc_id]["status"] = "failed"
                
        elif file_extension == '.txt':
            # 处理文本文件
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            from langchain_core.documents import Document
            document = Document(
                page_content=content,
                metadata={
                    "source": file_path,
                    "kb_id": kb_id,
                    "type": "text"
                }
            )
            
            processor = DocumentProcessor()
            processor.process_and_store([document], vector_store)
            
            # 估算切片数量
            chunk_count = len(content) // 500 + 1
            documents_storage[doc_id]["chunk_num"] = chunk_count
            documents_storage[doc_id]["status"] = "completed"
            knowledge_bases[kb_id]["chunk_count"] += chunk_count
            
        else:
            # 其他文件类型暂时标记为完成
            documents_storage[doc_id]["status"] = "completed"
            documents_storage[doc_id]["chunk_num"] = 1
            knowledge_bases[kb_id]["chunk_count"] += 1
        
        logger.info(f"✅ 文档处理完成: {doc_id}")
        
    except Exception as e:
        logger.error(f"❌ 文档处理失败 {doc_id}: {e}")
        if doc_id in documents_storage:
            documents_storage[doc_id]["status"] = "failed"

@app.delete("/api/v1/datasets/{dataset_id}/documents")
async def delete_documents(dataset_id: str, document_ids: List[str]):
    """批量删除文档"""
    try:
        if dataset_id not in knowledge_bases:
            return {
                "code": 404,
                "message": "知识库不存在",
                "data": None
            }
        
        deleted_count = 0
        for doc_id in document_ids:
            if doc_id in documents_storage and documents_storage[doc_id]["kb_id"] == dataset_id:
                # 删除文件
                file_path = documents_storage[doc_id].get("file_path")
                if file_path and os.path.exists(file_path):
                    os.remove(file_path)
                
                # 更新计数
                chunk_count = documents_storage[doc_id].get("chunk_num", 0)
                knowledge_bases[dataset_id]["chunk_count"] -= chunk_count
                knowledge_bases[dataset_id]["document_count"] -= 1
                
                del documents_storage[doc_id]
                deleted_count += 1
        
        return {
            "code": 0,
            "message": f"成功删除 {deleted_count} 个文档",
            "data": {"deleted_count": deleted_count}
        }
    except Exception as e:
        logger.error(f"删除文档失败: {e}")
        return {
            "code": 500,
            "message": f"删除失败: {str(e)}",
            "data": None
        }

# ===== 智能对话API =====
@app.post("/api/v1/chats_openai/{chat_id}/chat/completions")
async def chat_completions(chat_id: str, request: ChatRequest, background_tasks: BackgroundTasks):
    """OpenAI兼容的对话API - 使用异步任务处理"""
    try:
        # 获取用户消息
        user_messages = [msg for msg in request.messages if msg.role == "user"]
        if not user_messages:
            raise HTTPException(status_code=400, detail="没有找到用户消息")
        
        user_question = user_messages[-1].content
        task_id = str(uuid.uuid4())
        
        logger.info(f"💬 收到对话请求: {user_question[:50]}... (任务ID: {task_id})")
        
        # 初始化任务状态
        chat_tasks[task_id] = {
            "status": "processing",
            "result": None,
            "created_at": datetime.now().isoformat(),
            "question": user_question
        }
        
        # 后台处理任务
        background_tasks.add_task(process_chat_task, task_id, user_question, request.model)
        
        # 立即返回任务ID和状态
        return {
            "task_id": task_id,
            "status": "processing",
            "message": "正在处理中，请使用任务ID查询结果",
            "poll_url": f"/api/v1/chats_openai/task/{task_id}"
        }
        
    except Exception as e:
        logger.error(f"创建对话任务失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建任务失败: {str(e)}")

async def process_chat_task(task_id: str, question: str, model: str):
    """后台处理聊天任务"""
    try:
        logger.info(f"🔄 开始处理任务: {task_id}")
        
        # 更新状态为检索中
        chat_tasks[task_id]["status"] = "retrieving"
        chat_tasks[task_id]["message"] = "正在检索相关信息..."
        
        if RAG_AVAILABLE:
            try:
                # 检索阶段
                logger.info(f"🔍 开始RAG检索: {task_id}")
                reviews = await asyncio.get_event_loop().run_in_executor(
                    None, retriever.invoke, question
                )
                logger.info(f"📚 检索到 {len(reviews)} 个相关文档片段: {task_id}")
                
                # 更新状态为生成中
                chat_tasks[task_id]["status"] = "generating"
                chat_tasks[task_id]["message"] = "正在生成回答..."
                
                # 生成阶段
                logger.info(f"🤖 开始生成回答: {task_id}")
                result = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: chain.invoke({"reviews": reviews, "question": question})
                )
                
                # 任务完成
                chat_tasks[task_id] = {
                    **chat_tasks[task_id],
                    "status": "completed",
                    "message": "回答生成完成",
                    "result": {
                        "id": f"chatcmpl-{task_id[:10]}",
                        "object": "chat.completion",
                        "created": int(datetime.now().timestamp()),
                        "model": model,
                        "choices": [
                            {
                                "index": 0,
                                "message": {
                                    "role": "assistant",
                                    "content": result
                                },
                                "finish_reason": "stop"
                            }
                        ],
                        "usage": {
                            "prompt_tokens": len(question.split()),
                            "completion_tokens": len(result.split()) if isinstance(result, str) else 50,
                            "total_tokens": len(question.split()) + (len(result.split()) if isinstance(result, str) else 50)
                        }
                    },
                    "completed_at": datetime.now().isoformat()
                }
                
                logger.info(f"✅ 任务完成: {task_id}")
                
            except Exception as rag_error:
                logger.error(f"❌ RAG处理失败 {task_id}: {rag_error}")
                chat_tasks[task_id] = {
                    **chat_tasks[task_id],
                    "status": "failed",
                    "message": f"处理失败: {str(rag_error)}",
                    "error": str(rag_error),
                    "failed_at": datetime.now().isoformat()
                }
        else:
            # 模拟模式
            await asyncio.sleep(2)  # 模拟处理时间
            
            mock_answer = f"""感谢您的咨询："{question}"

我是现代汽车智能客服助手，当前系统运行在演示模式。

如果您的问题是关于：
• 车型信息 - 我可以为您介绍现代汽车的主要车型
• 售后服务 - 包括保养、维修、保修等相关服务
• 购车咨询 - 协助您了解购车流程和政策

为了获得最准确的信息，建议您：
1. 联系就近的现代汽车4S店
2. 拨打现代汽车客服热线
3. 访问现代汽车官方网站

有什么其他可以帮助您的吗？"""

            chat_tasks[task_id] = {
                **chat_tasks[task_id],
                "status": "completed",
                "message": "回答生成完成（演示模式）",
                "result": {
                    "id": f"chatcmpl-{task_id[:10]}",
                    "object": "chat.completion",
                    "created": int(datetime.now().timestamp()),
                    "model": model,
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": mock_answer
                            },
                            "finish_reason": "stop"
                        }
                    ],
                    "usage": {
                        "prompt_tokens": len(question.split()),
                        "completion_tokens": len(mock_answer.split()),
                        "total_tokens": len(question.split()) + len(mock_answer.split())
                    }
                },
                "completed_at": datetime.now().isoformat()
            }
            
            logger.info(f"✅ 演示任务完成: {task_id}")
            
    except Exception as e:
        logger.error(f"❌ 任务处理异常 {task_id}: {e}")
        chat_tasks[task_id] = {
            **chat_tasks.get(task_id, {}),
            "status": "failed",
            "message": f"系统异常: {str(e)}",
            "error": str(e),
            "failed_at": datetime.now().isoformat()
        }

@app.get("/api/v1/chats_openai/task/{task_id}")
async def get_chat_task(task_id: str):
    """查询聊天任务状态"""
    try:
        if task_id not in chat_tasks:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        task_info = chat_tasks[task_id]
        
        # 如果任务完成超过1小时，清理任务
        if task_info.get("status") in ["completed", "failed"]:
            completed_at = task_info.get("completed_at") or task_info.get("failed_at")
            if completed_at:
                from datetime import datetime, timedelta
                completed_time = datetime.fromisoformat(completed_at)
                if datetime.now() - completed_time > timedelta(hours=1):
                    del chat_tasks[task_id]
                    raise HTTPException(status_code=404, detail="任务已过期")
        
        return task_info
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"查询任务失败: {e}")
        raise HTTPException(status_code=500, detail=f"查询任务失败: {str(e)}")

# 添加简化的任务查询路径（兼容性）
@app.get("/api/v1/tasks/{task_id}")
async def get_task_simple(task_id: str):
    """简化的任务查询路径（兼容性）"""
    return await get_chat_task(task_id)

@app.get("/api/v1/chats_openai/tasks")
async def list_chat_tasks(limit: int = 10):
    """列出最近的聊天任务（调试用）"""
    try:
        # 按创建时间排序，返回最新的任务
        sorted_tasks = sorted(
            chat_tasks.items(),
            key=lambda x: x[1].get("created_at", ""),
            reverse=True
        )
        
        return {
            "total": len(chat_tasks),
            "tasks": [
                {
                    "task_id": task_id,
                    "status": task_info["status"],
                    "question": task_info.get("question", "")[:50] + "..." if len(task_info.get("question", "")) > 50 else task_info.get("question", ""),
                    "created_at": task_info.get("created_at"),
                    "message": task_info.get("message", "")
                }
                for task_id, task_info in sorted_tasks[:limit]
            ]
        }
    except Exception as e:
        logger.error(f"列出任务失败: {e}")
        return {"total": 0, "tasks": []}

# ===== 检索和测试API =====
@app.post("/api/retriever/test")
async def test_retriever(request: QueryRequest):
    """测试检索功能"""
    try:
        logger.info(f"🔍 测试检索: {request.question}")
        
        if not RAG_AVAILABLE:
            return {
                "query": request.question,
                "results": [
                    {
                        "content": f"模拟检索结果1 - 关于'{request.question}'的相关信息", 
                        "metadata": {"source": "demo", "score": 0.95}
                    },
                    {
                        "content": f"模拟检索结果2 - 更多关于'{request.question}'的详细信息", 
                        "metadata": {"source": "demo", "score": 0.87}
                    }
                ],
                "count": 2,
                "status": "mock_mode"
            }
        
        # 使用真实检索器
        results = retriever.get_relevant_documents(request.question)
        
        return {
            "query": request.question,
            "results": [
                {
                    "content": doc.page_content[:200] + "..." if len(doc.page_content) > 200 else doc.page_content,
                    "metadata": doc.metadata
                } for doc in results
            ],
            "count": len(results),
            "status": "success"
        }
    except Exception as e:
        logger.error(f"检索测试失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/retriever/stats")
async def get_vector_stats():
    """向量数据库统计"""
    try:
        if not RAG_AVAILABLE:
            return {
                "document_count": 0,
                "csv_records": 0,
                "knowledge_bases": len(knowledge_bases),
                "total_documents": len(documents_storage),
                "status": "mock_mode"
            }
        
        collection = vector_store._collection
        vector_count = collection.count()
        
        return {
            "document_count": vector_count,
            "csv_records": len(df_csv) if 'df_csv' in globals() else 0,
            "knowledge_bases": len(knowledge_bases),
            "total_documents": len(documents_storage),
            "status": "active",
            "details": {
                "knowledge_bases": list(knowledge_bases.keys()),
                "document_types": list(set(doc.get("type", "unknown") for doc in documents_storage.values()))
            }
        }
    except Exception as e:
        logger.error(f"获取统计信息失败: {e}")
        return {
            "document_count": 0,
            "csv_records": 0,
            "knowledge_bases": 0,
            "total_documents": 0,
            "status": "error",
            "error": str(e)
        }

# ===== 兼容性API =====
@app.post("/api/chat/send")
async def send_message(request: QueryRequest):
    """原有的对话API（兼容性）"""
    try:
        logger.info(f"💬 兼容API收到消息: {request.question}")
        
        if not RAG_AVAILABLE:
            return {
                "answer": f"您好！您询问的是：{request.question}。当前系统运行在演示模式，请联系管理员启用完整功能。",
                "reviews": [],
                "status": "mock_mode"
            }
        
        reviews = retriever.invoke(request.question)
        result = chain.invoke({"reviews": reviews, "question": request.question})
        
        return {
            "answer": result,
            "reviews": [doc.page_content for doc in reviews],
            "status": "success"
        }
    except Exception as e:
        logger.error(f"兼容API处理失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy", 
        "service": "现代汽车智能客服API",
        "timestamp": datetime.now().isoformat(),
        "rag_available": RAG_AVAILABLE
    }

@app.get("/api/system/info")
async def get_system_info():
    """系统信息"""
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
        },
        "rag_available": RAG_AVAILABLE,
        "system_stats": {
            "knowledge_bases": len(knowledge_bases),
            "documents": len(documents_storage),
            "vector_store_available": RAG_AVAILABLE
        }
    }

# ===== 启动时初始化 =====
@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    logger.info("🚀 现代汽车智能客服API启动中...")
    await initialize_system()
    logger.info("✅ 系统初始化完成")

if __name__ == "__main__":
    import uvicorn
    print("🚀 现代汽车智能客服API启动中...")
    print("📝 API文档: http://localhost:8000/docs")
    print("🔍 健康检查: http://localhost:8000/api/system/status")
    print("💬 测试对话: http://localhost:8000/docs#/default/chat_completions_api_v1_chats_openai__chat_id__chat_completions_post")
    uvicorn.run(app, host="0.0.0.0", port=8000)