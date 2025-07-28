import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, Database, Upload, FileText, Search, Plus, Trash2, Settings, AlertCircle, CheckCircle, Loader, Key, Car, Wrench, Book, LogIn } from 'lucide-react';

// 现代汽车智能客服本地API客户端
class HyundaiLocalAPIClient {
  constructor(baseURL = 'http://localhost:8000') {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json'
    };
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.defaultHeaders,
          ...options.headers
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
        throw new Error(errorData.message || `请求失败: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        throw new Error('无法连接到本地服务器，请确保API服务器正在运行');
      }
      throw error;
    }
  }

  // 系统状态检查
  async checkSystemStatus() {
    try {
      const response = await this.request('/api/system/status');
      return {
        success: true,
        message: response.message || '系统连接正常',
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        data: null
      };
    }
  }

  // 知识库管理
  async getKnowledgeBases(page = 1, pageSize = 30) {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString()
    });
    
    return this.request(`/api/v1/datasets?${params}`);
  }

  async createKnowledgeBase(name, description = '') {
    return this.request('/api/v1/datasets', {
      method: 'POST',
      body: JSON.stringify({
        name: name,
        description: description,
        embedding_model: 'BAAI/bge-large-zh-v1.5@BAAI',
        chunk_method: 'naive'
      })
    });
  }

  // 文档管理
  async getDocuments(knowledgeBaseId, page = 1, pageSize = 30) {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString()
    });

    return this.request(`/api/v1/datasets/${knowledgeBaseId}/documents?${params}`);
  }

  async uploadDocument(knowledgeBaseId, file) {
    const formData = new FormData();
    formData.append('file', file);

    // 这里直接用 fetch，不要用 this.request
    const url = `${this.baseURL}/api/v1/datasets/${knowledgeBaseId}/documents`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData
      // 不要加 headers，浏览器会自动加 multipart/form-data
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      throw new Error(errorData.message || `请求失败: ${response.status}`);
    }
    return await response.json();
  }

  // 智能对话
  async sendMessage(message, chatId = 'hyundai-assistant-001') {
    return this.request(`/api/v1/chats_openai/${chatId}/chat/completions`, {
      method: 'POST',
      body: JSON.stringify({
        model: 'hyundai-ai-model',
        messages: [
          { 
            role: 'system', 
            content: '你是现代汽车的专业智能客服助手，专门为客户提供汽车相关的咨询和服务。请用专业、友好的语气回答问题。' 
          },
          { role: 'user', content: message }
        ],
        stream: false
      })
    });
  }

  // 获取任务结果
  async getTaskResult(taskId) {
    const response = await this.request(`/api/v1/tasks/${taskId}`);
    return response;
  }
}

const HyundaiDirectIntegration = () => {
  const [activeTab, setActiveTab] = useState('chat');
  const [client] = useState(new HyundaiLocalAPIClient());
  const [isConnected, setIsConnected] = useState(false);
  const [serverMode, setServerMode] = useState('unknown');
  const [isLoading, setIsLoading] = useState(false);
  
  // 对话状态
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'assistant',
      content: '您好！我是现代汽车智能客服助手，很高兴为您服务。请问有什么可以帮助您的吗？',
      timestamp: '14:30'
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  
  // 知识库管理状态
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [selectedKB, setSelectedKB] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [isLoadingKB, setIsLoadingKB] = useState(false); // 新增：知识库加载状态
  
  // UI状态
  const [notification, setNotification] = useState({ type: '', message: '' });
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // 初始化连接测试
  useEffect(() => {
    testServerConnection();
  }, []);

  // 监听选项卡切换，自动加载知识库
  useEffect(() => {
    if (activeTab === 'knowledge' && isConnected && knowledgeBases.length === 0) {
      loadKnowledgeBases();
    }
  }, [activeTab, isConnected]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 测试服务器连接
  const testServerConnection = async () => {
    setIsLoading(true);
    try {
      const result = await client.checkSystemStatus();
      setIsConnected(result.success);
      
      if (result.success) {
        setServerMode(result.data?.mode || 'production');
        showNotification('success', result.message);
        // 如果当前在知识库页面，自动加载知识库
        if (activeTab === 'knowledge') {
          await loadKnowledgeBases();
        }
      } else {
        setServerMode('unknown');
        showNotification('error', result.message);
      }
    } catch (error) {
      setIsConnected(false);
      setServerMode('unknown');
      showNotification('error', '无法连接到本地API服务器，请检查服务器是否启动');
    } finally {
      setIsLoading(false);
    }
  };

  // 显示通知
  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification({ type: '', message: '' }), 4000);
  };

  // 处理登录
  const handleLogin = () => {
    showNotification('success', '登录功能开发中，当前为演示模式');
  };

  // 轮询任务结果 - 修改轮询间隔为10秒
  const pollTaskResult = async (taskId, thinkingMessageId) => {
    const maxAttempts = 60; // 最多轮询10分钟 (60次 * 10秒)
    let attempts = 0;
    
    const poll = async () => {
      try {
        attempts++;
        const taskResult = await client.getTaskResult(taskId);
        
        if (taskResult.status === 'completed') {
          // 任务完成，显示结果
          const assistantMessage = {
            id: Date.now() + 2,
            type: 'assistant',
            content: taskResult.result?.choices?.[0]?.message?.content || '回答生成完成',
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          };
          
          setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId).concat([assistantMessage]));
          return;
          
        } else if (taskResult.status === 'failed') {
          // 任务失败
          const errorMessage = {
            id: Date.now() + 2,
            type: 'assistant',
            content: `处理失败：${taskResult.message || taskResult.error || '未知错误'}`,
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          };
          
          setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId).concat([errorMessage]));
          return;
          
        } else if (taskResult.status === 'processing' || taskResult.status === 'retrieving' || taskResult.status === 'generating') {
          // 更新思考状态
          const statusMessages = {
            'processing': '正在处理中...',
            'retrieving': '正在检索相关信息...',
            'generating': '正在生成回答...'
          };
          
          setMessages(prev => prev.map(msg => 
            msg.id === thinkingMessageId 
              ? { ...msg, content: `${statusMessages[taskResult.status] || '正在思考中...'} (${attempts}/${maxAttempts})` }
              : msg
          ));
          
          // 继续轮询
          if (attempts < maxAttempts) {
            setTimeout(poll, 10000); // 改为每10秒轮询一次
          } else {
            // 超时处理
            const timeoutMessage = {
              id: Date.now() + 2,
              type: 'assistant',
              content: '处理时间过长，请稍后再试或联系技术支持。',
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            };
            
            setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId).concat([timeoutMessage]));
          }
        }
        
      } catch (error) {
        console.error('轮询任务状态失败:', error);
        
        if (attempts >= maxAttempts) {
          const errorMessage = {
            id: Date.now() + 2,
            type: 'assistant',
            content: '网络连接异常，请检查网络后重试。',
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          };
          
          setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId).concat([errorMessage]));
        } else {
          // 网络错误时重试，间隔也改为10秒
          setTimeout(poll, 10000);
        }
      }
    };
    
    // 第一次轮询延迟5秒
    setTimeout(poll, 5000);
  };

  // 发送消息（支持异步任务ID和轮询）
  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading || !isConnected) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputMessage;
    setInputMessage('');
    setIsLoading(true);

    // 添加"正在思考"的消息
    const thinkingMessage = {
      id: Date.now() + 1,
      type: 'assistant',
      content: '正在思考中，请稍候... (1/60)',
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      isThinking: true
    };
    setMessages(prev => [...prev, thinkingMessage]);

    try {
      // 发送消息并获取任务ID
      const response = await client.sendMessage(currentInput);
      
      if (response.task_id) {
        // 开始轮询任务状态
        await pollTaskResult(response.task_id, thinkingMessage.id);
      } else {
        // 兼容旧版API
        const assistantMessage = {
          id: Date.now() + 2,
          type: 'assistant',
          content: response.choices?.[0]?.message?.content || '抱歉，我暂时无法回答这个问题，请稍后再试。',
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        };
        
        setMessages(prev => prev.filter(msg => msg.id !== thinkingMessage.id).concat([assistantMessage]));
      }
    } catch (error) {
      const errorMessage = {
        id: Date.now() + 2,
        type: 'assistant',
        content: `抱歉，系统处理出现问题：${error.message}。请稍后再试或联系技术支持。`,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessage.id).concat([errorMessage]));
    } finally {
      setIsLoading(false);
    }
  };

  // 加载知识库 - 修复：添加加载状态和错误处理
  const loadKnowledgeBases = async () => {
    if (!isConnected) {
      console.log('服务器未连接，跳过加载知识库');
      return;
    }
    
    setIsLoadingKB(true);
    try {
      console.log('开始加载知识库...');
      const response = await client.getKnowledgeBases();
      console.log('知识库API响应:', response);
      
      if (response.code === 0) {
        const kbList = response.data || [];
        console.log('获取到知识库列表:', kbList);
        setKnowledgeBases(kbList);
        
        if (kbList.length > 0) {
          showNotification('success', `成功加载 ${kbList.length} 个知识库`);
        } else {
          console.log('知识库列表为空');
        }
      } else {
        console.error('加载知识库失败:', response);
        showNotification('error', response.message || '加载知识库失败');
      }
    } catch (error) {
      console.error('加载知识库异常:', error);
      showNotification('error', `加载知识库失败: ${error.message}`);
    } finally {
      setIsLoadingKB(false);
    }
  };

  // 创建知识库
  const createKnowledgeBase = async (name, description) => {
    if (!isConnected) return;
    
    try {
      setIsLoading(true);
      const response = await client.createKnowledgeBase(name, description);
      if (response.code === 0) {
        showNotification('success', '知识库创建成功');
        await loadKnowledgeBases(); // 重新加载知识库列表
      } else {
        showNotification('error', response.message || '创建知识库失败');
      }
    } catch (error) {
      showNotification('error', `创建知识库失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 上传文档
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !selectedKB || !isConnected) return;

    try {
      setIsLoading(true);
      const response = await client.uploadDocument(selectedKB.id, file);
      if (response.code === 0) {
        showNotification('success', '文档上传成功');
        await loadDocuments();
      } else {
        showNotification('error', response.message || '文档上传失败');
      }
    } catch (error) {
      showNotification('error', `文档上传失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 加载文档
  const loadDocuments = async () => {
    if (!selectedKB || !isConnected) return;
    
    try {
      const response = await client.getDocuments(selectedKB.id);
      if (response.code === 0) {
        setDocuments(response.data || []);
      } else {
        showNotification('error', '加载文档失败');
      }
    } catch (error) {
      showNotification('error', `加载文档失败: ${error.message}`);
    }
  };

  // 侧边导航组件
  const SideNavigation = () => (
    <div className="w-64 bg-white shadow-lg border-r">
      <div className="p-4 bg-blue-600 text-white">
        <div className="flex items-center">
          <Car className="w-8 h-8 mr-3" />
          <div>
            <h1 className="text-lg font-bold">现代汽车</h1>
            <p className="text-sm text-blue-100">智能客服系统</p>
          </div>
        </div>
      </div>
      
      <div className="p-4">
        <button 
          onClick={handleLogin}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg mb-6 flex items-center justify-center hover:bg-blue-700 transition-colors"
        >
          <LogIn className="w-4 h-4 mr-2" />
          登录
        </button>
        
        <nav className="space-y-2">
          <button
            onClick={() => setActiveTab('chat')}
            className={`w-full flex items-center px-4 py-3 rounded-lg text-left transition-colors ${
              activeTab === 'chat' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <MessageCircle className="w-5 h-5 mr-3" />
            智能客服
          </button>
          
          <button
            onClick={() => setActiveTab('documents')}
            className={`w-full flex items-center px-4 py-3 rounded-lg text-left transition-colors ${
              activeTab === 'documents' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <FileText className="w-5 h-5 mr-3" />
            文档处理
          </button>
          
          <button
            onClick={() => setActiveTab('knowledge')}
            className={`w-full flex items-center px-4 py-3 rounded-lg text-left transition-colors ${
              activeTab === 'knowledge' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Database className="w-5 h-5 mr-3" />
            知识库
          </button>
          
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center px-4 py-3 rounded-lg text-left transition-colors ${
              activeTab === 'settings' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Settings className="w-5 h-5 mr-3" />
            系统设置
          </button>
        </nav>
      </div>
    </div>
  );

  // 渲染智能客服界面
  const renderChat = () => (
    <div className="flex-1 flex flex-col">
      {/* 顶部标题栏 */}
      <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
        <div className="flex items-center">
          <MessageCircle className="w-6 h-6 mr-3" />
          <div>
            <h2 className="text-xl font-bold">现代汽车智能客服</h2>
            <p className="text-blue-100 text-sm">为您提供24小时专业服务</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
            <span className="text-sm">
              {isConnected ? (serverMode === 'mock' ? '本地演示' : '本地连接') : '连接异常'}
            </span>
          </div>
          <div className="bg-blue-700 px-3 py-1 rounded text-sm">
            轮询间隔: 10秒
          </div>
        </div>
      </div>

      {/* 对话区域 */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map(message => (
            <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex items-start space-x-3 max-w-2xl ${message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className="flex-shrink-0">
                  {message.type === 'user' ? (
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white">
                      👤
                    </div>
                  ) : (
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                      <Car className="w-6 h-6 text-blue-600" />
                    </div>
                  )}
                </div>
                <div className={`p-4 rounded-lg ${
                  message.type === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white border border-gray-200'
                }`}>
                  <p className="text-sm">{message.content}</p>
                  <p className={`text-xs mt-2 ${message.type === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                    {message.timestamp}
                  </p>
                </div>
              </div>
            </div>
          ))}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <div className="bg-white border-t p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && sendMessage()}
                placeholder="请输入您的问题..."
                disabled={isLoading || !isConnected}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              />
              <MessageCircle className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 transform -translate-y-1/2" />
            </div>
            <button
              onClick={sendMessage}
              disabled={isLoading || !inputMessage.trim() || !isConnected}
              className="bg-blue-600 text-white px-6 py-3 rounded-full hover:bg-blue-700 disabled:bg-gray-400 flex items-center space-x-2"
            >
              {isLoading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // 渲染文档处理界面
  const renderDocuments = () => (
    <div className="flex-1 p-6 bg-gray-50">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">文档处理与管理</h2>
      
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">上传新文档</h3>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">拖拽文件到此处或点击上传</p>
          <p className="text-sm text-gray-500 mb-4">支持PDF、DOCX、TXT格式</p>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            accept=".pdf,.docx,.txt"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!selectedKB || !isConnected}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            选择文件
          </button>
          {!selectedKB && (
            <p className="text-xs text-gray-500 mt-2">请先在知识库页面选择一个知识库</p>
          )}
        </div>
      </div>

      {/* 文档列表 */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-800">文档列表</h3>
          {selectedKB && (
            <p className="text-sm text-gray-500 mt-1">当前知识库: {selectedKB.name}</p>
          )}
        </div>
        <div className="divide-y">
          {documents.map(doc => (
            <div key={doc.id} className="p-4 flex justify-between items-center">
              <div className="flex items-center">
                <FileText className="w-5 h-5 text-gray-400 mr-3" />
                <div>
                  <span className="font-medium">{doc.name}</span>
                  <div className="text-sm text-gray-500">
                    状态: {doc.status} | 大小: {doc.size} | 切片: {doc.chunk_num || 0}
                  </div>
                </div>
              </div>
              <div className="flex space-x-2">
                <span className={`px-2 py-1 text-xs rounded-full ${
                  doc.status === 'completed' 
                    ? 'bg-green-100 text-green-800' 
                    : doc.status === 'processing'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {doc.status === 'completed' ? '已完成' : 
                   doc.status === 'processing' ? '处理中' : '待处理'}
                </span>
              </div>
            </div>
          ))}
          {documents.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>暂无文档</p>
              <p className="text-sm mt-1">请上传文档到知识库中</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // 渲染知识库界面 - 修复显示问题
  const renderKnowledgeBase = () => (
    <div className="flex-1 p-6 bg-gray-50">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">知识库管理</h2>
        <div className="flex items-center space-x-4">
          {/* 刷新按钮 */}
          <button
            onClick={loadKnowledgeBases}
            disabled={!isConnected || isLoadingKB}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:bg-gray-400 flex items-center"
          >
            {isLoadingKB ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                加载中...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                刷新
              </>
            )}
          </button>
          
          {/* 新建知识库按钮 */}
          <button
            onClick={() => {
              const name = prompt('请输入知识库名称:');
              const description = prompt('请输入知识库描述:');
              if (name) createKnowledgeBase(name, description || '');
            }}
            disabled={!isConnected}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            新建知识库
          </button>
        </div>
      </div>

      {/* 连接状态提示 */}
      {!isConnected && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
            <span className="text-yellow-800">请先连接到本地服务器才能管理知识库</span>
          </div>
        </div>
      )}

      {/* 加载状态 */}
      {isLoadingKB && (
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center mb-6">
          <Loader className="w-8 h-8 mx-auto mb-4 text-blue-600 animate-spin" />
          <p className="text-gray-600">正在加载知识库...</p>
        </div>
      )}

      {/* 知识库列表 */}
      <div className="grid gap-4">
        {knowledgeBases.map(kb => (
          <div
            key={kb.id}
            className={`bg-white rounded-lg shadow-sm border p-4 cursor-pointer transition-colors ${
              selectedKB?.id === kb.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
            }`}
            onClick={() => {
              setSelectedKB(kb);
              loadDocuments();
            }}
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">{kb.name}</h3>
                <p className="text-gray-600 text-sm">{kb.description || '无描述'}</p>
                <div className="flex space-x-4 text-sm text-gray-500 mt-2">
                  <span>{kb.document_count || 0} 个文档</span>
                  <span>{kb.chunk_count || 0} 个切片</span>
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    kb.status === 'active' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {kb.status === 'active' ? '活跃' : '不活跃'}
                  </span>
                </div>
              </div>
              <div className="flex space-x-2">
                {selectedKB?.id === kb.id && (
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                )}
              </div>
            </div>
          </div>
        ))}
        
        {/* 空状态显示 */}
        {isConnected && !isLoadingKB && knowledgeBases.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
            <Database className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 mb-2">暂无知识库</p>
            <p className="text-sm text-gray-400 mb-4">请创建您的第一个知识库</p>
            <button
              onClick={() => {
                const name = prompt('请输入知识库名称:');
                const description = prompt('请输入知识库描述:');
                if (name) createKnowledgeBase(name, description || '');
              }}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center mx-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              创建第一个知识库
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // 渲染系统设置界面
  const renderSettings = () => (
    <div className="flex-1 p-6 bg-gray-50">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">系统设置</h2>
      
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">本地服务器连接</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span>服务器地址</span>
            <span className="text-gray-600 font-mono">http://localhost:8000</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span>连接状态</span>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
                {isConnected ? '已连接' : '连接失败'}
              </span>
            </div>
          </div>
          
          <div className="flex justify-between items-center">
            <span>运行模式</span>
            <span className={`px-2 py-1 rounded text-sm ${
              serverMode === 'production' 
                ? 'bg-green-100 text-green-800' 
                : serverMode === 'mock'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {serverMode === 'production' ? '生产模式' : 
               serverMode === 'mock' ? '演示模式' : '未知'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span>轮询间隔</span>
            <span className="text-gray-600">10秒 (优化后)</span>
          </div>
          
          <button
            onClick={testServerConnection}
            disabled={isLoading}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                测试中...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                测试连接
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">性能优化配置</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span>对话轮询间隔</span>
            <span className="text-gray-600">10秒 (减少服务器压力)</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span>最大轮询次数</span>
            <span className="text-gray-600">60次 (总计10分钟)</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span>知识库自动加载</span>
            <span className="text-green-600">已启用</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span>错误重试机制</span>
            <span className="text-green-600">已启用</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">系统信息</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span>系统名称</span>
            <span className="text-gray-600">现代汽车智能客服系统</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span>版本信息</span>
            <span className="text-gray-600">v2024.1 (优化版)</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span>技术架构</span>
            <span className="text-gray-600">React + Flask + RAGFlow</span>
          </div>

          <div className="flex justify-between items-center">
            <span>知识库数量</span>
            <span className="text-gray-600">{knowledgeBases.length} 个</span>
          </div>
        </div>
      </div>

      {/* 服务器启动说明 */}
      {!isConnected && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mt-6">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-yellow-800 mb-2">本地服务器未启动</h4>
              <p className="text-sm text-yellow-700 mb-3">
                请按以下步骤启动本地API服务器：
              </p>
              <ol className="text-sm text-yellow-700 space-y-1">
                <li>1. 确保已安装Python和相关依赖</li>
                <li>2. 在终端中运行: <code className="bg-yellow-100 px-2 py-1 rounded">python api_server.py</code></li>
                <li>3. 等待服务器启动完成 (端口8000)</li>
                <li>4. 点击"测试连接"按钮验证</li>
              </ol>
              <div className="mt-4 p-3 bg-yellow-100 rounded border">
                <p className="text-xs text-yellow-800 font-medium">优化说明：</p>
                <ul className="text-xs text-yellow-700 mt-1 space-y-1">
                  <li>• 轮询间隔已优化为10秒，减少服务器负载</li>
                  <li>• 知识库会在切换到相应页面时自动加载</li>
                  <li>• 添加了详细的加载状态和错误提示</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  
  return (
    <div className="min-h-screen bg-gray-100">
      {/* 通知消息 */}
      {notification.message && (
        <div className={`fixed top-4 right-4 px-4 py-3 rounded z-50 flex items-center ${
          notification.type === 'success' 
            ? 'bg-green-100 border border-green-400 text-green-700'
            : 'bg-red-100 border border-red-400 text-red-700'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="w-4 h-4 mr-2" />
          ) : (
            <AlertCircle className="w-4 h-4 mr-2" />
          )}
          {notification.message}
        </div>
      )}

      {/* 主界面 */}
      <div className="flex h-screen">
        {/* 侧边导航栏 */}
        <SideNavigation />
        
        {/* 主要内容区域 */}
        {activeTab === 'chat' && renderChat()}
        {activeTab === 'documents' && renderDocuments()}
        {activeTab === 'knowledge' && renderKnowledgeBase()}
        {activeTab === 'settings' && renderSettings()}
      </div>
    </div>
  );
};

export default HyundaiDirectIntegration;
            