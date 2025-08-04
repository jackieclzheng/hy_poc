// HyundaiDirectIntegration.js - 完整的改进版本
import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, Database, Upload, FileText, Search, Plus, Trash2, Settings, AlertCircle, CheckCircle, Loader, Key, Car, Wrench, Book, LogIn } from 'lucide-react';

// 改进的API客户端
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

  async deleteKnowledgeBase(kbId) {
    return this.request(`/api/v1/datasets/${kbId}`, {
      method: 'DELETE'
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
    formData.append('file', file, file.name); // 显式指定文件名

    // 直接使用fetch避免添加JSON headers
    const url = `${this.baseURL}/api/v1/datasets/${knowledgeBaseId}/documents`;
    
    console.log('准备上传文件:', {
      url,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData
        // 不设置headers，让浏览器自动设置Content-Type for multipart/form-data
      });

      console.log('服务器响应状态:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          message: `HTTP ${response.status}: ${response.statusText}` 
        }));
        console.error('服务器返回错误:', errorData);
        throw new Error(errorData.message || `请求失败: ${response.status}`);
      }

      const result = await response.json();
      console.log('上传成功，服务器响应:', result);
      return result;
    } catch (error) {
      console.error('上传请求失败:', error);
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        throw new Error('无法连接到本地服务器，请确保API服务器正在运行');
      }
      throw error;
    }
  }

  // 改进的聊天功能 - 支持知识库关联
  async sendMessageWithKB(message, kbId = null, chatId = 'hyundai-assistant-001') {
    const params = new URLSearchParams();
    if (kbId) {
      params.append('kb_id', kbId);
    }
    
    const url = `/api/v1/chats_openai/${chatId}/chat/completions${kbId ? '?' + params : ''}`;
    
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify({
        model: 'hyundai-assistant',
        messages: [
          {
            role: 'user',
            content: message
          }
        ]
      })
    });
  }

  async getTaskResult(taskId) {
    return this.request(`/api/v1/chats_openai/task/${taskId}`);
  }

  // 聊天会话管理
  async createChatSession(kbId = null, title = null) {
    return this.request('/api/v1/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({
        kb_id: kbId,
        title: title || `对话 ${new Date().toLocaleString()}`
      })
    });
  }

  async getChatSessions(page = 1, pageSize = 30) {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString()
    });
    
    return this.request(`/api/v1/chat/sessions?${params}`);
  }

  // 兼容性方法
  async sendMessage(message, chatId = 'hyundai-assistant-001') {
    return this.sendMessageWithKB(message, null, chatId);
  }
}

const HyundaiDirectIntegration = () => {
  // 状态管理
  const [client] = useState(() => new HyundaiLocalAPIClient());
  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [serverMode, setServerMode] = useState('unknown');
  const [notification, setNotification] = useState({ type: '', message: '' });
  
  // 知识库相关状态
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [selectedKB, setSelectedKB] = useState(null);
  const [selectedChatKB, setSelectedChatKB] = useState(null); // 新增：聊天页面选择的知识库
  const [documents, setDocuments] = useState([]);
  const [isLoadingKB, setIsLoadingKB] = useState(false);
  const [showCreateKBModal, setShowCreateKBModal] = useState(false);
  const [newKBName, setNewKBName] = useState('');
  const [newKBDescription, setNewKBDescription] = useState('');
  
  // 聊天会话相关状态
  const [chatSessions, setChatSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  
  // Refs
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // 初始化和生命周期
  useEffect(() => {
    testServerConnection();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 自动加载知识库
  useEffect(() => {
    if (activeTab === 'knowledge') {
      loadKnowledgeBases();
    }
  }, [activeTab]);

  // 测试服务器连接
  const testServerConnection = async () => {
    setIsLoading(true);
    try {
      const result = await client.checkSystemStatus();
      setIsConnected(result.success);
      
      if (result.success) {
        setServerMode(result.data?.mode || 'production');
        showNotification('success', result.message);
        // 加载知识库列表供聊天页面使用
        await loadKnowledgeBasesForChat();
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

  // 加载知识库列表（用于聊天页面选择器）
  const loadKnowledgeBasesForChat = async () => {
    try {
      const result = await client.getKnowledgeBases(1, 100); // 加载更多用于选择
      if (result.code === 0) {
        setKnowledgeBases(result.data || []);
      }
    } catch (error) {
      console.error('加载知识库列表失败:', error);
    }
  };

  // 处理聊天知识库切换
  const handleChatKBChange = (kbId) => {
    const kb = knowledgeBases.find(k => k.id === kbId);
    setSelectedChatKB(kb);
    
    if (kb) {
      showNotification('success', `已切换到知识库: ${kb.name}`);
    } else {
      showNotification('info', '已取消知识库关联，将使用全局检索');
    }
  };

  // 改进的发送消息功能
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    if (!isConnected) {
      showNotification('error', '请先连接到服务器');
      return;
    }

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputMessage.trim(),
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputMessage.trim();
    setInputMessage('');
    setIsLoading(true);

    // 添加思考状态消息
    const thinkingMessageId = Date.now() + 1;
    const thinkingMessage = {
      id: thinkingMessageId,
      type: 'assistant',
      content: '正在思考中...',
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      isThinking: true
    };
    setMessages(prev => [...prev, thinkingMessage]);

    try {
      // 使用改进的API，支持知识库关联
      const response = await client.sendMessageWithKB(
        currentInput, 
        selectedChatKB?.id, 
        currentSession?.id || 'hyundai-assistant-001'
      );
      
      if (response.task_id) {
        // 开始轮询任务结果
        await pollTaskResult(response.task_id, thinkingMessageId);
      } else {
        throw new Error('未返回任务ID');
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      
      const errorMessage = {
        id: Date.now() + 2,
        type: 'assistant',
        content: `抱歉，发送消息时出现错误：${error.message}`,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      };
      
      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId).concat([errorMessage]));
      showNotification('error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 轮询任务结果
  const pollTaskResult = async (taskId, thinkingMessageId) => {
    const maxAttempts = 60; // 最多轮询10分钟
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
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            kbUsed: selectedChatKB?.name // 记录使用的知识库
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
          
        } else if (['processing', 'retrieving', 'generating'].includes(taskResult.status)) {
          // 更新思考状态
          const statusMessages = {
            'processing': '正在处理中...',
            'retrieving': `正在从${selectedChatKB ? selectedChatKB.name : '全局知识库'}检索相关信息...`,
            'generating': '正在生成回答...'
          };
          
          setMessages(prev => prev.map(msg => 
            msg.id === thinkingMessageId 
              ? { ...msg, content: statusMessages[taskResult.status] || '处理中...' }
              : msg
          ));
          
          // 继续轮询
          if (attempts < maxAttempts) {
            setTimeout(poll, 10000); // 10秒轮询间隔
          } else {
            throw new Error('处理超时');
          }
        }
      } catch (error) {
        console.error('轮询任务结果失败:', error);
        const errorMessage = {
          id: Date.now() + 2,
          type: 'assistant',
          content: `处理超时或出现错误：${error.message}`,
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        };
        
        setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId).concat([errorMessage]));
      }
    };
    
    // 开始轮询
    setTimeout(poll, 2000); // 2秒后开始第一次轮询
  };

  // 知识库管理功能
  const loadKnowledgeBases = async () => {
    if (!isConnected) return;
    
    setIsLoadingKB(true);
    try {
      const result = await client.getKnowledgeBases();
      if (result.code === 0) {
        setKnowledgeBases(result.data || []);
      } else {
        showNotification('error', result.message || '加载知识库失败');
      }
    } catch (error) {
      console.error('加载知识库失败:', error);
      showNotification('error', error.message);
    } finally {
      setIsLoadingKB(false);
    }
  };

  const handleCreateKnowledgeBase = async () => {
    if (!newKBName.trim()) {
      showNotification('error', '请输入知识库名称');
      return;
    }

    try {
      const result = await client.createKnowledgeBase(newKBName.trim(), newKBDescription.trim());
      if (result.code === 0) {
        showNotification('success', '知识库创建成功');
        setShowCreateKBModal(false);
        setNewKBName('');
        setNewKBDescription('');
        await loadKnowledgeBases();
        await loadKnowledgeBasesForChat(); // 更新聊天页面的知识库列表
      } else {
        showNotification('error', result.message || '创建知识库失败');
      }
    } catch (error) {
      console.error('创建知识库失败:', error);
      showNotification('error', error.message);
    }
  };

  const handleDeleteKnowledgeBase = async (kbId, kbName) => {
    if (!window.confirm(`确定要删除知识库"${kbName}"吗？此操作将同时删除所有相关文档和数据，且不可恢复。`)) {
      return;
    }

    try {
      const result = await client.deleteKnowledgeBase(kbId);
      if (result.code === 0) {
        showNotification('success', '知识库删除成功');
        await loadKnowledgeBases();
        await loadKnowledgeBasesForChat();
        
        // 如果删除的是当前选中的知识库，清空选择
        if (selectedKB?.id === kbId) {
          setSelectedKB(null);
          setDocuments([]);
        }
        if (selectedChatKB?.id === kbId) {
          setSelectedChatKB(null);
        }
      } else {
        showNotification('error', result.message || '删除知识库失败');
      }
    } catch (error) {
      console.error('删除知识库失败:', error);
      showNotification('error', error.message);
    }
  };

  // 文档管理功能
  const loadDocuments = async (kbId) => {
    if (!kbId || !isConnected) return;
    
    try {
      console.log('🔍 正在加载知识库文档:', kbId);
      const result = await client.getDocuments(kbId);
      console.log('📋 API返回结果:', result);
      
      if (result.code === 0) {
        console.log('📄 文档列表:', result.data);
        console.log('📊 文档数量:', result.data ? result.data.length : 0);
        setDocuments(result.data || []);
      } else {
        console.error('❌ 加载文档失败:', result.message);
        showNotification('error', result.message || '加载文档失败');
      }
    } catch (error) {
      console.error('加载文档失败:', error);
      showNotification('error', error.message);
    }
  };

  const testFileUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    
    // 调试：查看 FormData 内容
    console.log('FormData 内容:');
    for (let [key, value] of formData.entries()) {
      console.log('  ', key, ':', value);
    }
    
    try {
      const response = await fetch('http://localhost:8000/api/v1/test-upload', {
        method: 'POST',
        body: formData,
        // 确保不设置 Content-Type，让浏览器自动设置
      });
      
      console.log('测试上传响应状态:', response.status);
      console.log('响应头:', Object.fromEntries(response.headers.entries()));
      
      const responseText = await response.text();
      console.log('原始响应内容:', responseText);
      
      try {
        const result = JSON.parse(responseText);
        console.log('测试上传结果:', result);
        return result;
      } catch (parseError) {
        console.error('解析响应 JSON 失败:', parseError);
        throw new Error(`服务器响应不是有效的 JSON: ${responseText}`);
      }
    } catch (error) {
      console.error('测试上传失败:', error);
      throw error;
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !selectedKB) return;

    console.log('文件信息:', {
      name: file.name,
      size: file.size,
      type: file.type,
      kbId: selectedKB.id
    });

    try {
      // 先测试简单上传
      console.log('🧪 测试文件上传...');
      const testResult = await testFileUpload(file);
      console.log('✅ 测试上传成功:', testResult);
      
      // 如果测试成功，再尝试正式上传
      const result = await client.uploadDocument(selectedKB.id, file);
      console.log('上传结果:', result);
      if (result.code === 0) {
        showNotification('success', '文件上传成功，正在处理中...');
        await loadDocuments(selectedKB.id);
        await loadKnowledgeBases(); // 刷新知识库统计
        await loadKnowledgeBasesForChat(); // 更新聊天页面列表
      } else {
        showNotification('error', result.message || '文件上传失败');
      }
    } catch (error) {
      console.error('文件上传失败:', error);
      showNotification('error', error.message);
    }
    
    // 清空文件输入
    event.target.value = '';
  };

  // 渲染聊天界面 - 改进版本
  const renderChat = () => (
    <div className="flex-1 flex flex-col">
      {/* 顶部标题栏 - 添加知识库选择器 */}
      <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
        <div className="flex items-center">
          <MessageCircle className="w-6 h-6 mr-3" />
          <div>
            <h2 className="text-xl font-bold">现代汽车智能客服</h2>
            <p className="text-blue-100 text-sm">为您提供24小时专业服务</p>
          </div>
        </div>
        
        {/* 知识库选择器和状态显示 */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4" />
            <select 
              value={selectedChatKB?.id || ''}
              onChange={(e) => handleChatKBChange(e.target.value)}
              className="bg-blue-700 text-white px-3 py-1 rounded text-sm border-none focus:ring-2 focus:ring-blue-300"
              disabled={!isConnected}
            >
              <option value="">全局检索</option>
              {knowledgeBases.map(kb => (
                <option key={kb.id} value={kb.id}>
                  {kb.name} ({kb.document_count}文档)
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
            <span className="text-sm">
              {isConnected ? (serverMode === 'mock' ? '演示模式' : '已连接') : '连接异常'}
            </span>
          </div>
        </div>
      </div>

      {/* 知识库状态提示 */}
      {selectedChatKB && (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-3">
          <div className="flex">
            <div className="flex-shrink-0">
              <Database className="h-5 w-5 text-blue-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                当前使用知识库：<strong>{selectedChatKB.name}</strong> 
                ({selectedChatKB.document_count} 个文档，{selectedChatKB.chunk_count} 个文档片段)
              </p>
              <p className="text-xs text-blue-600 mt-1">{selectedChatKB.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* 对话区域 */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Car className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">欢迎使用现代汽车智能客服</h3>
              <p className="text-gray-500 mb-4">
                {selectedChatKB 
                  ? `当前关联知识库：${selectedChatKB.name}` 
                  : '您可以选择特定知识库或使用全局检索'}
              </p>
              <div className="text-sm text-gray-400">
                <p>• 询问车辆信息和规格</p>
                <p>• 了解售后服务政策</p>
                <p>• 获取购车建议</p>
              </div>
            </div>
          )}
          
          {messages.map(message => (
            <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex items-start space-x-3 max-w-2xl ${message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className="flex-shrink-0">
                  {message.type === 'user' ? (
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">您</span>
                    </div>
                  ) : (
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <Car className="w-4 h-4 text-gray-600" />
                    </div>
                  )}
                </div>
                <div className={`rounded-lg px-4 py-3 ${message.type === 'user' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-white border shadow-sm'
                }`}>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  <div className={`text-xs mt-2 ${message.type === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                    {message.timestamp}
                    {message.kbUsed && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        <Database className="w-3 h-3 mr-1" />
                        {message.kbUsed}
                      </span>
                    )}
                    {message.isThinking && (
                      <Loader className="inline w-3 h-3 ml-2 animate-spin" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <div className="border-t bg-white p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder={selectedChatKB ? `向 ${selectedChatKB.name} 提问...` : "请输入您的问题..."}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!isConnected || isLoading}
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || !isConnected || isLoading}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
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

  // 渲染知识库管理界面 - 改进版本
  const renderKnowledgeBase = () => (
    <div className="flex-1 p-6 bg-gray-50">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">知识库管理</h2>
        <div className="flex items-center space-x-4">
          <button
            onClick={loadKnowledgeBases}
            disabled={!isConnected || isLoadingKB}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:bg-gray-400 flex items-center"
          >
            {isLoadingKB ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            刷新
          </button>
          <button
            onClick={() => setShowCreateKBModal(true)}
            disabled={!isConnected}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            创建知识库
          </button>
        </div>
      </div>

      {/* 知识库列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {knowledgeBases.map(kb => (
          <div 
            key={kb.id} 
            className={`bg-white rounded-lg shadow-sm border-2 p-6 cursor-pointer transition-all ${
              selectedKB?.id === kb.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => {
              setSelectedKB(kb);
              loadDocuments(kb.id);
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                <Database className="w-8 h-8 text-blue-500 mr-3" />
                <div>
                  <h3 className="font-semibold text-gray-800">{kb.name}</h3>
                  <p className="text-sm text-gray-500">{kb.description || '暂无描述'}</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteKnowledgeBase(kb.id, kb.name);
                }}
                className="text-red-500 hover:text-red-700 p-1"
                title="删除知识库"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center text-gray-600">
                <FileText className="w-4 h-4 mr-2" />
                <span>文档: {kb.document_count || 0}</span>
              </div>
              <div className="flex items-center text-gray-600">
                <Book className="w-4 h-4 mr-2" />
                <span>切片: {kb.chunk_count || 0}</span>
              </div>
            </div>
            
            <div className="mt-4 text-xs text-gray-500">
              创建于: {new Date(kb.created_at).toLocaleString()}
            </div>
            
            {selectedKB?.id === kb.id && (
              <div className="mt-3 text-sm text-blue-600 flex items-center">
                <CheckCircle className="w-4 h-4 mr-1" />
                已选中 - 在下方管理文档
              </div>
            )}
          </div>
        ))}
        
        {knowledgeBases.length === 0 && !isLoadingKB && (
          <div className="col-span-full text-center py-12">
            <Database className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">暂无知识库</h3>
            <p className="text-gray-500 mb-4">创建您的第一个知识库来开始使用智能问答功能</p>
            <button
              onClick={() => setShowCreateKBModal(true)}
              disabled={!isConnected}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              创建知识库
            </button>
          </div>
        )}
      </div>

      {/* 选中知识库的文档列表 */}
      {selectedKB && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b">
            <h3 className="text-lg font-semibold text-gray-800">
              {selectedKB.name} - 文档列表
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {selectedKB.description} | 共 {documents.length} 个文档
            </p>
          </div>
          
          {/* 上传文档区域 */}
          <div className="p-4 border-b bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-700">上传新文档</h4>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                accept=".pdf,.docx,.txt,.csv,.xlsx"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!isConnected}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center text-sm"
              >
                <Upload className="w-4 h-4 mr-2" />
                选择文件
              </button>
            </div>
            <p className="text-xs text-gray-500">
              支持格式：PDF、DOCX、TXT、CSV、XLSX（最大 50MB）
            </p>
          </div>
          
          {/* 文档列表 */}
          <div className="divide-y">
            {console.log('🎨 渲染文档列表，当前documents状态:', documents, '数量:', documents.length)}
            {documents.map(doc => (
              <div key={doc.id} className="p-4 flex justify-between items-center">
                <div className="flex items-center">
                  <FileText className="w-5 h-5 text-gray-400 mr-3" />
                  <div>
                    <span className="font-medium">{doc.name}</span>
                    <div className="text-sm text-gray-500">
                      状态: {doc.status} | 大小: {doc.size} | 切片: {doc.chunk_num || 0}
                      <br />
                      创建时间: {new Date(doc.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    doc.status === 'completed' 
                      ? 'bg-green-100 text-green-800' 
                      : doc.status === 'processing'
                      ? 'bg-yellow-100 text-yellow-800'
                      : doc.status === 'failed'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {doc.status === 'completed' ? '已完成' : 
                     doc.status === 'processing' ? '处理中' : 
                     doc.status === 'failed' ? '失败' : '待处理'}
                  </span>
                </div>
              </div>
            ))}
            
            {documents.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>该知识库暂无文档</p>
                <p className="text-sm mt-1">请上传文档来构建知识库内容</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // 渲染设置界面
  const renderSettings = () => (
    <div className="flex-1 p-6 bg-gray-50">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">系统设置</h2>
      
      <div className="space-y-6">
        {/* 连接设置 */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">连接设置</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">服务器状态</span>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                <span className={`text-sm ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                  {isConnected ? '已连接' : '未连接'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-700">运行模式</span>
              <span className={`text-sm px-2 py-1 rounded ${
                serverMode === 'production' ? 'bg-green-100 text-green-800' :
                serverMode === 'flexible_storage' ? 'bg-blue-100 text-blue-800' :
                serverMode === 'traditional' ? 'bg-yellow-100 text-yellow-800' :
                serverMode === 'mock' ? 'bg-gray-100 text-gray-800' :
                'bg-red-100 text-red-800'
              }`}>
                {serverMode === 'production' ? '生产模式' :
                 serverMode === 'flexible_storage' ? '灵活存储模式' :
                 serverMode === 'traditional' ? '传统模式' :
                 serverMode === 'mock' ? '演示模式' : 
                 '未知'}
              </span>
            </div>
            
            <button
              onClick={testServerConnection}
              disabled={isLoading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center"
            >
              {isLoading ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <Key className="w-4 h-4 mr-2" />}
              测试连接
            </button>
          </div>
        </div>

        {/* 系统信息 */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">系统信息</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">知识库数量:</span>
              <span className="ml-2 font-medium">{knowledgeBases.length}</span>
            </div>
            <div>
              <span className="text-gray-600">文档总数:</span>
              <span className="ml-2 font-medium">
                {knowledgeBases.reduce((sum, kb) => sum + (kb.document_count || 0), 0)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">文档片段:</span>
              <span className="ml-2 font-medium">
                {knowledgeBases.reduce((sum, kb) => sum + (kb.chunk_count || 0), 0)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">当前会话:</span>
              <span className="ml-2 font-medium">{messages.length} 条消息</span>
            </div>
          </div>
        </div>

        {/* 使用说明 */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">使用说明</h3>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-start">
              <MessageCircle className="w-4 h-4 mr-2 mt-0.5 text-blue-500" />
              <div>
                <strong>智能对话:</strong> 在聊天页面选择知识库后进行专业咨询
              </div>
            </div>
            <div className="flex items-start">
              <Database className="w-4 h-4 mr-2 mt-0.5 text-green-500" />
              <div>
                <strong>知识库管理:</strong> 创建、删除知识库，上传和管理文档
              </div>
            </div>
            <div className="flex items-start">
              <Upload className="w-4 h-4 mr-2 mt-0.5 text-orange-500" />
              <div>
                <strong>文档处理:</strong> 支持PDF、DOCX、TXT、CSV等格式自动向量化
              </div>
            </div>
            <div className="flex items-start">
              <Settings className="w-4 h-4 mr-2 mt-0.5 text-gray-500" />
              <div>
                <strong>系统设置:</strong> 查看连接状态和系统信息
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // 创建知识库模态框
  const renderCreateKBModal = () => {
    if (!showCreateKBModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">创建新知识库</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                知识库名称 *
              </label>
              <input
                type="text"
                value={newKBName}
                onChange={(e) => setNewKBName(e.target.value)}
                placeholder="例如：产品手册、技术文档"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                描述信息
              </label>
              <textarea
                value={newKBDescription}
                onChange={(e) => setNewKBDescription(e.target.value)}
                placeholder="简要描述知识库的用途和内容"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={() => {
                setShowCreateKBModal(false);
                setNewKBName('');
                setNewKBDescription('');
              }}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              取消
            </button>
            <button
              onClick={handleCreateKnowledgeBase}
              disabled={!newKBName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              创建
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 通知组件
  const renderNotification = () => {
    if (!notification.message) return null;

    const icons = {
      success: <CheckCircle className="w-5 h-5 text-green-500" />,
      error: <AlertCircle className="w-5 h-5 text-red-500" />,
      info: <AlertCircle className="w-5 h-5 text-blue-500" />
    };

    const bgColors = {
      success: 'bg-green-50 border-green-200',
      error: 'bg-red-50 border-red-200',
      info: 'bg-blue-50 border-blue-200'
    };

    return (
      <div className={`fixed top-4 right-4 max-w-sm w-full border rounded-lg p-4 shadow-lg z-50 ${bgColors[notification.type]}`}>
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {icons[notification.type]}
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-800">
              {notification.message}
            </p>
          </div>
        </div>
      </div>
    );
  };

  // 主渲染
  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* 左侧导航栏 */}
      <div className="w-64 bg-white shadow-lg">
        <div className="p-6">
          <div className="flex items-center">
            <Car className="w-8 h-8 text-blue-600 mr-3" />
            <div>
              <h1 className="text-xl font-bold text-gray-800">现代智能助手</h1>
              <p className="text-sm text-gray-500">v2.0 Enhanced</p>
            </div>
          </div>
        </div>
        
        <nav className="mt-8 px-4 space-y-2">
          <button
            onClick={() => setActiveTab('chat')}
            className={`w-full flex items-center px-4 py-3 rounded-lg text-left transition-colors ${
              activeTab === 'chat' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <MessageCircle className="w-5 h-5 mr-3" />
            智能对话
            {selectedChatKB && (
              <span className="ml-auto text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">
                {selectedChatKB.name}
              </span>
            )}
          </button>
          
          <button
            onClick={() => setActiveTab('knowledge')}
            className={`w-full flex items-center px-4 py-3 rounded-lg text-left transition-colors ${
              activeTab === 'knowledge' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Database className="w-5 h-5 mr-3" />
            知识库管理
            {knowledgeBases.length > 0 && (
              <span className="ml-auto text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                {knowledgeBases.length}
              </span>
            )}
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
        
        {/* 底部状态 */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className={`p-3 rounded-lg text-center text-sm ${
            isConnected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            <div className="flex items-center justify-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              {isConnected ? '服务已连接' : '连接异常'}
            </div>
          </div>
        </div>
      </div>

      {/* 右侧主要内容区 */}
      <div className="flex-1 flex flex-col">
        {activeTab === 'chat' && renderChat()}
        {activeTab === 'knowledge' && renderKnowledgeBase()}
        {activeTab === 'settings' && renderSettings()}
      </div>

      {/* 模态框和通知 */}
      {renderCreateKBModal()}
      {renderNotification()}
    </div>
  );
};

export default HyundaiDirectIntegration;