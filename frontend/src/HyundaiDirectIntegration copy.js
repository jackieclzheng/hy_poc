import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, Database, Settings, Upload, FileText, Search, Plus, Trash2, Edit, Save, X, AlertCircle, CheckCircle, Loader, Code, PlayCircle } from 'lucide-react';

// 真实的Python后端API客户端 - 连接您现有的Python文件
class PythonBackendAPI {
  constructor(baseURL = 'http://localhost:8000') {
    this.baseURL = baseURL;
  }

  async request(endpoint, options = {}) {
    try {
      const url = `${this.baseURL}${endpoint}`;
      
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API请求失败:', error);
      throw error;
    }
  }

  // 健康检查
  async healthCheck() {
    return this.request('/api/health');
  }

  // 发送聊天消息 - 对接rag_doc_vect_agent_main.py
  async sendMessage(message) {
    return this.request('/api/chat/send', {
      method: 'POST',
      body: JSON.stringify({ question: message })
    });
  }

  // 获取向量库统计 - 对接rag_doc_vect_retriever.py
  async getVectorStats() {
    return this.request('/api/retriever/stats');
  }

  // 测试检索器
  async testRetriever(query) {
    return this.request('/api/retriever/test', {
      method: 'POST',
      body: JSON.stringify({ question: query })
    });
  }

  // 上传文件 - 对接rag_doc_vect_embedding_csv.py
  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    return fetch(`${this.baseURL}/api/upload`, {
      method: 'POST',
      body: formData
    }).then(res => res.json());
  }

  // 系统信息
  async getSystemInfo() {
    return this.request('/api/system/info');
  }
}

const HyundaiDirectIntegration = () => {
  const [activeTab, setActiveTab] = useState('setup');
  const [pythonAPI] = useState(new PythonBackendAPI());
  const [backendStatus, setBackendStatus] = useState('checking');
  const [systemInfo, setSystemInfo] = useState(null);
  const [messages, setMessages] = useState([
    { id: 1, role: 'assistant', content: '您好！我是现代汽车智能客服助手。我已经连接到您的Python RAG系统，可以基于您的知识库回答问题。', timestamp: '刚刚' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [vectorStats, setVectorStats] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const messagesEndRef = useRef(null);

  // 检查后端连接状态
  useEffect(() => {
    checkBackendConnection();
    const interval = setInterval(checkBackendConnection, 30000); // 每30秒检查一次
    return () => clearInterval(interval);
  }, []);

  const checkBackendConnection = async () => {
    try {
      setBackendStatus('checking');
      const health = await pythonAPI.healthCheck();
      const info = await pythonAPI.getSystemInfo();
      const stats = await pythonAPI.getVectorStats();
      
      setBackendStatus('connected');
      setSystemInfo(info);
      setVectorStats(stats);
    } catch (error) {
      setBackendStatus('disconnected');
      console.error('Backend connection failed:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading || backendStatus !== 'connected') return;

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: inputValue,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await pythonAPI.sendMessage(userMessage.content);
      
      const botMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: response.answer || response.result || '抱歉，我无法处理您的问题。',
        reviews: response.reviews,
        retrievedCount: response.retrieved_count,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Message sending failed:', error);
      const errorMessage = {
        id: Date.now() + 1,
        role: 'error',
        content: `连接失败：${error.message}。请确保Python后端服务正在运行。`,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadProgress(10);

    try {
      const uploadResult = await pythonAPI.uploadFile(file);
      setUploadProgress(60);
      
      // 刷新系统状态
      await checkBackendConnection();
      setUploadProgress(100);
      
      setTimeout(() => setUploadProgress(0), 2000);
      alert(`文件上传成功！文件名：${uploadResult.filename}`);
    } catch (error) {
      console.error('File upload failed:', error);
      alert('文件上传失败：' + error.message);
      setUploadProgress(0);
    }
  };

  const testSystem = async () => {
    try {
      const testQuery = "途胜有哪些配置？";
      const result = await pythonAPI.testRetriever(testQuery);
      alert(`检索测试成功！\n查询：${testQuery}\n找到 ${result.count} 条相关文档`);
    } catch (error) {
      alert('检索测试失败：' + error.message);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const renderStatusIndicator = (status) => {
    const statusConfig = {
      checking: { color: 'bg-yellow-500', text: '检查中' },
      connected: { color: 'bg-green-500', text: '已连接' },
      disconnected: { color: 'bg-red-500', text: '未连接' }
    };
    
    const config = statusConfig[status] || statusConfig.disconnected;
    
    return (
      <div className="flex items-center">
        <div className={`w-3 h-3 rounded-full mr-2 ${config.color}`}></div>
        <span className="text-sm">{config.text}</span>
      </div>
    );
  };

  const renderSetup = () => (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Python后端快速连接</h2>
      
      {/* 连接状态 */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">连接状态</h3>
          <button
            onClick={checkBackendConnection}
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
          >
            刷新状态
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="flex items-center">
            {renderStatusIndicator(backendStatus)}
          </div>
          <div className="flex items-center">
            <Database className="w-4 h-4 mr-2 text-blue-600" />
            <span className="text-sm">
              文档数量: {vectorStats?.document_count || 0}
            </span>
          </div>
          <div className="flex items-center">
            <FileText className="w-4 h-4 mr-2 text-green-600" />
            <span className="text-sm">
              CSV记录: {vectorStats?.csv_records || 0}
            </span>
          </div>
        </div>

        {backendStatus === 'disconnected' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <h4 className="text-red-800 font-medium">Python服务未连接</h4>
            </div>
            <p className="text-red-700 text-sm">
              请在项目根目录创建并运行 api_server.py 文件
            </p>
          </div>
        )}
      </div>

      {/* 快速启动指南 */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <PlayCircle className="w-5 h-5 mr-2" />
          快速启动指南
        </h3>
        
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">步骤1: 创建 api_server.py 文件</h4>
            <p className="text-sm text-gray-600 mb-2">在您的项目根目录（与Python文件同级）创建：</p>
            <pre className="text-xs bg-gray-800 text-white p-3 rounded overflow-x-auto">
{`from fastapi import FastAPI, UploadFile, File, HTTPException
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
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)`}
            </pre>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">步骤2: 安装依赖并启动</h4>
            <pre className="text-xs bg-gray-800 text-white p-3 rounded">
{`# 安装FastAPI依赖
pip install fastapi uvicorn python-multipart

# 启动服务
python api_server.py`}
            </pre>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">步骤3: 确保Ollama运行</h4>
            <pre className="text-xs bg-gray-800 text-white p-3 rounded">
{`# 启动Ollama
ollama serve

# 确保模型已下载
ollama pull llama3
ollama pull mxbai-embed-large`}
            </pre>
          </div>
        </div>

        <div className="mt-4 flex space-x-2">
          <button
            onClick={checkBackendConnection}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            测试连接
          </button>
          <button
            onClick={testSystem}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            disabled={backendStatus !== 'connected'}
          >
            测试检索
          </button>
        </div>
      </div>

      {/* 系统信息 */}
      {systemInfo && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">系统信息</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Python文件状态</h4>
              {Object.entries(systemInfo.python_files || {}).map(([key, exists]) => (
                <div key={key} className="flex items-center text-sm">
                  {exists ? 
                    <CheckCircle className="w-4 h-4 text-green-600 mr-2" /> : 
                    <AlertCircle className="w-4 h-4 text-red-600 mr-2" />
                  }
                  <span>{key}: {exists ? '已找到' : '未找到'}</span>
                </div>
              ))}
            </div>
            <div>
              <h4 className="font-medium mb-2">数据文件状态</h4>
              {Object.entries(systemInfo.data_files || {}).map(([key, exists]) => (
                <div key={key} className="flex items-center text-sm">
                  {exists ? 
                    <CheckCircle className="w-4 h-4 text-green-600 mr-2" /> : 
                    <AlertCircle className="w-4 h-4 text-red-600 mr-2" />
                  }
                  <span>{key}: {exists ? '已找到' : '未找到'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderChat = () => (
    <div className="flex flex-col h-full">
      <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
        <div className="flex items-center">
          <MessageCircle className="w-6 h-6 mr-3" />
          <div>
            <h2 className="text-xl font-bold">智能客服 (直连Python)</h2>
            <p className="text-blue-100 text-sm">基于您现有RAG系统的智能对话</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {renderStatusIndicator(backendStatus)}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {backendStatus === 'disconnected' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <div>
                <h4 className="text-red-800 font-medium">Python后端未连接</h4>
                <p className="text-red-700 text-sm mt-1">
                  请先完成"后端配置"中的设置步骤
                </p>
              </div>
            </div>
          </div>
        )}

        {messages.map(message => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs md:max-w-md lg:max-w-lg rounded-lg p-4 ${
              message.role === 'user' 
                ? 'bg-blue-600 text-white' 
                : message.role === 'error'
                ? 'bg-red-100 text-red-800 border border-red-200'
                : 'bg-white text-gray-800 border border-gray-200'
            }`}>
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              
              {message.reviews && message.reviews.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs font-medium mb-2">
                    基于 {message.retrievedCount || message.reviews.length} 条相关文档生成回答：
                  </p>
                  {message.reviews.slice(0, 2).map((review, idx) => (
                    <div key={idx} className="bg-gray-50 p-2 rounded text-xs mb-1">
                      {review.length > 100 ? review.substring(0, 100) + '...' : review}
                    </div>
                  ))}
                </div>
              )}
              
              <p className="text-xs mt-2 opacity-70">{message.timestamp}</p>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-800 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Loader className="w-4 h-4 animate-spin" />
                <span className="text-sm">正在处理您的问题...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-4 bg-white border-t">
        <div className="flex space-x-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !isLoading && sendMessage()}
            placeholder="请输入您的问题..."
            disabled={isLoading || backendStatus !== 'connected'}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !inputValue.trim() || backendStatus !== 'connected'}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
          >
            {isLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );

  const renderDocuments = () => (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">文档管理</h2>
      
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">上传新文档</h3>
        <div className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center">
          <Upload className="w-12 h-12 text-blue-400 mx-auto mb-4" />
          <p className="text-blue-600 mb-2">点击上传CSV文件</p>
          <p className="text-sm text-blue-500">文件将自动添加到向量数据库</p>
          
          {uploadProgress > 0 && (
            <div className="mt-4">
              <div className="bg-white rounded-full h-2 mb-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-blue-600">上传中... {uploadProgress}%</p>
            </div>
          )}
          
          <input
            type="file"
            onChange={handleFileUpload}
            accept=".csv,.pdf,.txt"
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 cursor-pointer inline-block"
          >
            选择文件
          </label>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">当前状态</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {vectorStats?.document_count || 0}
            </div>
            <div className="text-sm text-gray-500">文档切片数量</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {vectorStats?.csv_records || 0}
            </div>
            <div className="text-sm text-gray-500">CSV记录数量</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {vectorStats?.status === 'active' ? '活跃' : '空闲'}
            </div>
            <div className="text-sm text-gray-500">向量库状态</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="flex h-screen">
        {/* 侧边栏 */}
        <div className="w-64 bg-white shadow-lg">
          <div className="p-4">
            <div className="flex items-center mb-8">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                <Code className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-800">现代汽车</h1>
                <p className="text-sm text-gray-500">直连Python RAG</p>
              </div>
            </div>
          </div>
          
          <nav className="px-4 pb-4">
            <div className="space-y-2">
              <button
                onClick={() => setActiveTab('setup')}
                className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'setup' 
                    ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Settings className="w-5 h-5 mr-3" />
                后端配置
              </button>
              
              <button
                onClick={() => setActiveTab('chat')}
                className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'chat' 
                    ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <MessageCircle className="w-5 h-5 mr-3" />
                智能对话
              </button>
              
              <button
                onClick={() => setActiveTab('documents')}
                className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'documents' 
                    ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <FileText className="w-5 h-5 mr-3" />
                文档管理
              </button>
            </div>
          </nav>
        </div>
        
        {/* 主内容区 */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'setup' && renderSetup()}
          {activeTab === 'chat' && renderChat()}
          {activeTab === 'documents' && renderDocuments()}
        </div>
      </div>
    </div>
  );
};

export default HyundaiDirectIntegration;