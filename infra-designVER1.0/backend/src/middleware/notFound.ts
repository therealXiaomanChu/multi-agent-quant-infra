import { Request, Response, NextFunction } from 'express'
import { AppError } from './errorHandler'

export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const error = new AppError(`路径 ${req.originalUrl} 未找到`, 404)
  next(error)
}

export default notFound