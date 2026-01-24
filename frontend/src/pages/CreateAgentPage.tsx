import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DocumentTextIcon,
  CodeBracketIcon,
  TagIcon,
  EyeIcon,
  EyeSlashIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'

interface FormData {
  name: string
  description: string
  code: string
  language: string
  tags: string[]
  category: string
  isPublic: boolean
}

interface FormErrors {
  name?: string
  description?: string
  code?: string
  language?: string
  tags?: string
  category?: string
}

const LANGUAGES = [
  { value: 'python', label: 'Python', icon: '🐍' },
  { value: 'javascript', label: 'JavaScript', icon: '🟨' },
  { value: 'typescript', label: 'TypeScript', icon: '🔷' },
  { value: 'java', label: 'Java', icon: '☕' },
  { value: 'cpp', label: 'C++', icon: '⚡' },
  { value: 'csharp', label: 'C#', icon: '🔵' }
]

const CATEGORIES = [
  { value: 'trend_following', label: '趋势跟踪', description: '跟随市场趋势的策略' },
  { value: 'mean_reversion', label: '均值回归', description: '基于价格回归均值的策略' },
  { value: 'arbitrage', label: '套利策略', description: '利用价格差异获利的策略' },
  { value: 'market_making', label: '做市策略', description: '提供流动性的做市策略' },
  { value: 'momentum', label: '动量策略', description: '基于价格动量的策略' },
  { value: 'other', label: '其他', description: '其他类型的交易策略' }
]

const POPULAR_TAGS = [
  '机器学习', '深度学习', '技术分析', '基本面分析', '高频交易',
  '量化分析', '风险管理', '算法交易', '人工智能', '数据挖掘'
]

export function CreateAgentPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCodePreview, setShowCodePreview] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    code: '',
    language: 'python',
    tags: [],
    category: 'other',
    isPublic: true
  })
  
  const [errors, setErrors] = useState<FormErrors>({})
  const [tagInput, setTagInput] = useState('')

  // 验证表单
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}
    
    if (!formData.name.trim()) {
      newErrors.name = '代理名称是必需的'
    } else if (formData.name.length < 3) {
      newErrors.name = '代理名称至少需要3个字符'
    } else if (formData.name.length > 100) {
      newErrors.name = '代理名称不能超过100个字符'
    }
    
    if (!formData.description.trim()) {
      newErrors.description = '描述是必需的'
    } else if (formData.description.length < 10) {
      newErrors.description = '描述至少需要10个字符'
    } else if (formData.description.length > 1000) {
      newErrors.description = '描述不能超过1000个字符'
    }
    
    if (!formData.code.trim()) {
      newErrors.code = '策略代码是必需的'
    } else if (formData.code.length < 50) {
      newErrors.code = '代码至少需要50个字符'
    } else if (formData.code.length > 50000) {
      newErrors.code = '代码不能超过50000个字符'
    }
    
    if (!formData.language) {
      newErrors.language = '编程语言是必需的'
    }
    
    if (!formData.category) {
      newErrors.category = '策略类别是必需的'
    }
    
    if (formData.tags.length > 10) {
      newErrors.tags = '标签不能超过10个'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // 添加标签
  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim()) && formData.tags.length < 10) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }))
      setTagInput('')
    }
  }

  // 移除标签
  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }))
  }

  // 添加热门标签
  const addPopularTag = (tag: string) => {
    if (!formData.tags.includes(tag) && formData.tags.length < 10) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }))
    }
  }

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      toast.error('请检查表单中的错误')
      return
    }
    
    if (!user) {
      toast.error('请先登录')
      navigate('/login')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      // 这里应该调用API提交数据
      // const response = await api.post('/agents', formData)
      
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      toast.success('交易代理创建成功！')
      navigate('/agents')
    } catch (error) {
      console.error('创建代理失败:', error)
      toast.error('创建代理失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 步骤导航
  const steps = [
    { id: 1, name: '基本信息', description: '设置代理名称和描述' },
    { id: 2, name: '策略代码', description: '上传您的交易策略代码' },
    { id: 3, name: '分类标签', description: '设置分类和标签' },
    { id: 4, name: '发布设置', description: '配置发布选项' }
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* 页面标题 */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">创建交易代理</h1>
        <p className="mt-2 text-lg text-gray-600">
          上传您的交易策略，让它在平台上展示实力
        </p>
      </div>

      {/* 步骤指示器 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <nav aria-label="Progress">
          <ol className="flex items-center justify-between">
            {steps.map((step, stepIdx) => (
              <li key={step.id} className={`relative ${stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-20' : ''}`}>
                {stepIdx !== steps.length - 1 && (
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="h-0.5 w-full bg-gray-200" />
                  </div>
                )}
                <button
                  onClick={() => setCurrentStep(step.id)}
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full ${
                    currentStep >= step.id
                      ? 'bg-blue-600 text-white'
                      : 'border-2 border-gray-300 bg-white text-gray-500'
                  } hover:bg-blue-700 hover:text-white transition-colors`}
                >
                  <span className="text-sm font-medium">{step.id}</span>
                </button>
                <div className="mt-2 text-center">
                  <p className="text-sm font-medium text-gray-900">{step.name}</p>
                  <p className="text-xs text-gray-500">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* 表单内容 */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* 步骤1: 基本信息 */}
        {currentStep === 1 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-6">
              <DocumentTextIcon className="h-6 w-6 text-blue-600 mr-3" />
              <h2 className="text-xl font-semibold text-gray-900">基本信息</h2>
            </div>
            
            <div className="space-y-6">
              {/* 代理名称 */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  代理名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className={`input ${errors.name ? 'border-red-500' : ''}`}
                  placeholder="例如: AlphaBot Pro"
                  maxLength={100}
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                )}
                <p className="mt-1 text-sm text-gray-500">
                  {formData.name.length}/100 字符
                </p>
              </div>

              {/* 描述 */}
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                  策略描述 <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="description"
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className={`input ${errors.description ? 'border-red-500' : ''}`}
                  placeholder="详细描述您的交易策略，包括策略原理、适用市场、预期收益等..."
                  maxLength={1000}
                />
                {errors.description && (
                  <p className="mt-1 text-sm text-red-600">{errors.description}</p>
                )}
                <p className="mt-1 text-sm text-gray-500">
                  {formData.description.length}/1000 字符
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 步骤2: 策略代码 */}
        {currentStep === 2 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <CodeBracketIcon className="h-6 w-6 text-blue-600 mr-3" />
                <h2 className="text-xl font-semibold text-gray-900">策略代码</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCodePreview(!showCodePreview)}
                className="flex items-center text-sm text-blue-600 hover:text-blue-700"
              >
                {showCodePreview ? (
                  <><EyeSlashIcon className="h-4 w-4 mr-1" />隐藏预览</>
                ) : (
                  <><EyeIcon className="h-4 w-4 mr-1" />显示预览</>
                )}
              </button>
            </div>
            
            <div className="space-y-6">
              {/* 编程语言选择 */}
              <div>
                <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-2">
                  编程语言 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.value}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, language: lang.value }))}
                      className={`p-3 border rounded-lg text-left transition-colors ${
                        formData.language === lang.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="flex items-center">
                        <span className="text-lg mr-2">{lang.icon}</span>
                        <span className="font-medium">{lang.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
                {errors.language && (
                  <p className="mt-1 text-sm text-red-600">{errors.language}</p>
                )}
              </div>

              {/* 代码编辑器 */}
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
                  策略代码 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <textarea
                    id="code"
                    rows={showCodePreview ? 12 : 20}
                    value={formData.code}
                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                    className={`input font-mono text-sm ${errors.code ? 'border-red-500' : ''}`}
                    placeholder={`# 请输入您的${LANGUAGES.find(l => l.value === formData.language)?.label}交易策略代码\n# 示例:\ndef trading_strategy(data):\n    # 您的策略逻辑\n    return signals`}
                    maxLength={50000}
                  />
                  <div className="absolute bottom-2 right-2 text-xs text-gray-500 bg-white px-2 py-1 rounded">
                    {formData.code.length}/50000
                  </div>
                </div>
                {errors.code && (
                  <p className="mt-1 text-sm text-red-600">{errors.code}</p>
                )}
                
                {/* 代码要求说明 */}
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start">
                    <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mr-2 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                      <p className="font-medium mb-2">代码提交要求：</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>代码必须包含完整的交易策略逻辑</li>
                        <li>请确保代码语法正确，能够正常运行</li>
                        <li>建议包含必要的注释说明</li>
                        <li>避免使用外部依赖或敏感信息</li>
                        <li>代码将用于回测和实盘验证</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 步骤3: 分类标签 */}
        {currentStep === 3 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-6">
              <TagIcon className="h-6 w-6 text-blue-600 mr-3" />
              <h2 className="text-xl font-semibold text-gray-900">分类和标签</h2>
            </div>
            
            <div className="space-y-6">
              {/* 策略分类 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  策略分类 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {CATEGORIES.map((category) => (
                    <button
                      key={category.value}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, category: category.value }))}
                      className={`p-4 border rounded-lg text-left transition-colors ${
                        formData.category === category.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className={`font-medium ${
                        formData.category === category.value ? 'text-blue-700' : 'text-gray-900'
                      }`}>
                        {category.label}
                      </div>
                      <div className={`text-sm mt-1 ${
                        formData.category === category.value ? 'text-blue-600' : 'text-gray-500'
                      }`}>
                        {category.description}
                      </div>
                    </button>
                  ))}
                </div>
                {errors.category && (
                  <p className="mt-1 text-sm text-red-600">{errors.category}</p>
                )}
              </div>

              {/* 标签 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  标签 (最多10个)
                </label>
                
                {/* 当前标签 */}
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {formData.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="ml-2 text-blue-600 hover:text-blue-800"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                
                {/* 添加标签 */}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    className="input flex-1"
                    placeholder="输入标签名称"
                    maxLength={20}
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    disabled={!tagInput.trim() || formData.tags.length >= 10}
                    className="btn btn-secondary px-4"
                  >
                    添加
                  </button>
                </div>
                
                {/* 热门标签 */}
                <div>
                  <p className="text-sm text-gray-600 mb-2">热门标签：</p>
                  <div className="flex flex-wrap gap-2">
                    {POPULAR_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => addPopularTag(tag)}
                        disabled={formData.tags.includes(tag) || formData.tags.length >= 10}
                        className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                          formData.tags.includes(tag)
                            ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
                
                {errors.tags && (
                  <p className="mt-1 text-sm text-red-600">{errors.tags}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 步骤4: 发布设置 */}
        {currentStep === 4 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-6">
              <CloudArrowUpIcon className="h-6 w-6 text-blue-600 mr-3" />
              <h2 className="text-xl font-semibold text-gray-900">发布设置</h2>
            </div>
            
            <div className="space-y-6">
              {/* 公开设置 */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">公开策略</h3>
                    <p className="text-sm text-gray-500">允许其他用户查看和使用您的策略</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, isPublic: !prev.isPublic }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.isPublic ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.isPublic ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* 提交预览 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-3">提交预览</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">代理名称:</span>
                    <span className="font-medium">{formData.name || '未设置'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">编程语言:</span>
                    <span className="font-medium">
                      {LANGUAGES.find(l => l.value === formData.language)?.label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">策略分类:</span>
                    <span className="font-medium">
                      {CATEGORIES.find(c => c.value === formData.category)?.label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">标签数量:</span>
                    <span className="font-medium">{formData.tags.length}/10</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">代码长度:</span>
                    <span className="font-medium">{formData.code.length} 字符</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">公开状态:</span>
                    <span className={`font-medium ${
                      formData.isPublic ? 'text-green-600' : 'text-gray-600'
                    }`}>
                      {formData.isPublic ? '公开' : '私有'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 提交须知 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <CheckCircleIcon className="h-5 w-5 text-blue-600 mr-2 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-2">提交后将进行：</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>代码安全性检查</li>
                      <li>策略有效性验证</li>
                      <li>历史数据回测</li>
                      <li>性能指标计算</li>
                      <li>风险评估分析</li>
                    </ul>
                    <p className="mt-2 text-xs text-blue-600">
                      整个过程可能需要几分钟时间，请耐心等待。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 导航按钮 */}
        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
            className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            上一步
          </button>
          
          <div className="flex space-x-3">
            {currentStep < 4 ? (
              <button
                type="button"
                onClick={() => setCurrentStep(Math.min(4, currentStep + 1))}
                className="btn btn-primary"
              >
                下一步
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    创建中...
                  </>
                ) : (
                  <>
                    <CloudArrowUpIcon className="h-4 w-4 mr-2" />
                    创建代理
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}