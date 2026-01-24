import { Fragment } from 'react'
import { Menu, Transition } from '@headlessui/react'
import { 
  Bars3Icon, 
  BellIcon, 
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline'
import { useAuthStore } from '../stores/authStore'
import { Link } from 'react-router-dom'

interface HeaderProps {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, logout } = useAuthStore()

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="flex items-center justify-between px-6 py-4">
        {/* 左侧 - 菜单按钮和标题 */}
        <div className="flex items-center space-x-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
          
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">TA</span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 hidden sm:block">
              Trading Agent Platform
            </h1>
          </div>
        </div>

        {/* 右侧 - 通知和用户菜单 */}
        <div className="flex items-center space-x-4">
          {/* 通知按钮 */}
          <button className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-full relative">
            <BellIcon className="h-6 w-6" />
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-400"></span>
          </button>

          {/* 用户菜单 */}
          {user ? (
            <Menu as="div" className="relative">
              <Menu.Button className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-center space-x-2">
                  <img
                    className="h-8 w-8 rounded-full object-cover"
                    src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=3b82f6&color=fff`}
                    alt={user.username}
                  />
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-gray-900">{user.username}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                </div>
              </Menu.Button>

              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 mt-2 w-48 origin-top-right bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                  <div className="py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          to="/profile"
                          className={`${active ? 'bg-gray-100' : ''} flex items-center px-4 py-2 text-sm text-gray-700`}
                        >
                          <UserCircleIcon className="mr-3 h-5 w-5" />
                          个人资料
                        </Link>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          className={`${active ? 'bg-gray-100' : ''} flex items-center w-full px-4 py-2 text-sm text-gray-700`}
                        >
                          <Cog6ToothIcon className="mr-3 h-5 w-5" />
                          设置
                        </button>
                      )}
                    </Menu.Item>
                    <div className="border-t border-gray-100"></div>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={logout}
                          className={`${active ? 'bg-gray-100' : ''} flex items-center w-full px-4 py-2 text-sm text-gray-700`}
                        >
                          <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5" />
                          退出登录
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          ) : (
            <div className="flex items-center space-x-2">
              <Link
                to="/login"
                className="btn btn-secondary px-4 py-2"
              >
                登录
              </Link>
              <Link
                to="/register"
                className="btn btn-primary px-4 py-2"
              >
                注册
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}