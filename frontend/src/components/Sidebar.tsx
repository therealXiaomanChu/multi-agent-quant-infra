import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import {
  HomeIcon,
  CpuChipIcon,
  TrophyIcon,
  FireIcon,
  ChartBarIcon,
  UserIcon,
  Cog6ToothIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'
import { Link, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const navigation = [
  { name: '首页', href: '/', icon: HomeIcon },
  { name: '交易代理', href: '/agents', icon: CpuChipIcon },
  { name: '排行榜', href: '/leaderboard', icon: TrophyIcon },
  { name: 'PK对战', href: '/battle', icon: FireIcon },
  { name: '回测分析', href: '/backtest', icon: ChartBarIcon },
  { name: '个人中心', href: '/profile', icon: UserIcon },
]

const secondaryNavigation = [
  { name: '设置', href: '/settings', icon: Cog6ToothIcon },
  { name: '帮助文档', href: '/docs', icon: DocumentTextIcon },
]

export function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation()

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 px-4 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <span className="text-blue-600 font-bold text-sm">TA</span>
          </div>
          <span className="text-white font-semibold text-lg">Trading Agent</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={onClose}
                className={clsx(
                  'group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <item.icon
                  className={clsx(
                    'mr-3 h-5 w-5 flex-shrink-0',
                    isActive ? 'text-blue-700' : 'text-gray-400 group-hover:text-gray-500'
                  )}
                />
                {item.name}
              </Link>
            )
          })}
        </div>

        {/* 分隔线 */}
        <div className="border-t border-gray-200 my-6"></div>

        {/* 次要导航 */}
        <div className="space-y-1">
          <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            其他
          </h3>
          {secondaryNavigation.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={onClose}
                className={clsx(
                  'group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <item.icon
                  className={clsx(
                    'mr-3 h-5 w-5 flex-shrink-0',
                    isActive ? 'text-blue-700' : 'text-gray-400 group-hover:text-gray-500'
                  )}
                />
                {item.name}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* 底部信息 */}
      <div className="p-4 border-t border-gray-200">
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <FireIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-blue-800">
                今日活跃代理
              </p>
              <p className="text-xs text-blue-600">
                128 个代理正在交易
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* 移动端侧边栏 */}
      <Transition.Root show={open} as={Fragment}>
        <Dialog as="div" className="relative z-50 lg:hidden" onClose={onClose}>
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/80" />
          </Transition.Child>

          <div className="fixed inset-0 flex">
            <Transition.Child
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                <Transition.Child
                  as={Fragment}
                  enter="ease-in-out duration-300"
                  enterFrom="opacity-0"
                  enterTo="opacity-100"
                  leave="ease-in-out duration-300"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                    <button type="button" className="-m-2.5 p-2.5" onClick={onClose}>
                      <span className="sr-only">关闭侧边栏</span>
                      <XMarkIcon className="h-6 w-6 text-white" aria-hidden="true" />
                    </button>
                  </div>
                </Transition.Child>
                <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white">
                  <SidebarContent />
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>

      {/* 桌面端侧边栏 */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white border-r border-gray-200">
          <SidebarContent />
        </div>
      </div>
    </>
  )
}