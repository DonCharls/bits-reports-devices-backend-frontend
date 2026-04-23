import React from 'react'

interface AuthLayoutProps {
  children: React.ReactNode
  showLoading?: boolean
  loadingMessage?: string
}

export function AuthLayout({ 
  children, 
  showLoading = false, 
  loadingMessage = 'Preparing your workspace...' 
}: AuthLayoutProps) {
  // Fullscreen loading overlay
  if (showLoading) {
    return (
      <div className="fixed inset-0 z-100 flex flex-col items-center justify-center bg-linear-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="flex flex-col items-center gap-8 animate-fadeIn">
          {/* wait.png image */}
          <div className="relative">
            <div className="absolute -inset-4 bg-red-600/20 rounded-full blur-2xl animate-pulse" />
            <img
              src="/images/wait.png"
              alt="Loading"
              className="relative w-48 h-auto drop-shadow-2xl"
            />
          </div>

          {/* Loading text */}
          <div className="text-center space-y-3">
            <h2 className="text-xl font-bold text-white tracking-wide">Wait...</h2>
            <p className="text-sm text-gray-400">{loadingMessage}</p>
          </div>

          {/* Loading bar */}
          <div className="w-48 h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-red-600 rounded-full animate-loadingBar" />
          </div>
        </div>

        <style jsx>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes loadingBar {
            0% { width: 0%; }
            100% { width: 100%; }
          }
          .animate-fadeIn {
            animation: fadeIn 0.5s ease-out;
          }
          .animate-loadingBar {
            animation: loadingBar 2.3s ease-in-out;
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen w-full overflow-y-auto">
      {/* Background Image with adjustable opacity */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: 'url(/placeholder.svg?height=1080&width=1920&query=city_skyline_background)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.3,
        }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 z-0 bg-linear-to-r from-gray-200 to-gray-900" />

      {/* Content Container - Centered Card */}
      <div className="relative z-10 flex min-h-screen w-full items-center justify-center px-4">
        <div className="w-full max-w-5xl overflow-hidden rounded-3xl shadow-2xl">
          <div className="flex flex-col md:flex-row">
            {/* Left Side - Dynamic Form Content */}
            <div className="flex w-full flex-col items-center justify-center bg-white/5 px-6 py-12 backdrop-blur-md md:w-1/2 md:px-9 md:py-16">
              <div className="w-full max-w-sm">
                {children}
              </div>
            </div>

            {/* Right Side - Logo and Description (Solid Red Box) */}
            <div className="flex w-full flex-col items-center justify-center bg-gray-600 px-6 py-12 md:w-1/2 md:px-10 md:py-16">
              <div className="w-full max-w-sm text-center">
                {/* Logo Placeholder */}
                <div className="mb-8 flex h-50 w-full items-center justify-center rounded-lg bg-red">
                  <img
                    src="/images/av.jpg"
                    alt="Company Logo"
                    className="h-full w-full object-contain p-4"
                    onError={(e) => {
                      e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23DC2626" width="200" height="200"/%3E%3Ctext x="50%" y="50%" fontSize="48" fill="white" textAnchor="middle" dominantBaseline="middle" fontWeight="bold"%3EAB%3C/text%3E%3C/svg%3E'
                    }}
                  />
                </div>

                {/* Description Text */}
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold text-gray-300">AVEGA BROS.</h2>
                  <p className="text-sm leading-relaxed text-gray-300">
                    Biometric Integrated Timekeeping System
                  </p>
                  <p className="text-xs text-gray-400">© 2026 Developed by AVEGA BROS. IT Interns</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
