interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Standardized API response wrapper.
 * Ensures every endpoint returns a consistent JSON shape.
 */
export class ApiResponse<T = unknown> {
  public readonly success: boolean;
  public readonly statusCode: number;
  public readonly message: string;
  public readonly data: T | null;
  public readonly timestamp: string;
  public readonly pagination: Pagination | null;

  private constructor(
    success: boolean,
    statusCode: number,
    message: string,
    data: T | null = null,
    pagination: Pagination | null = null
  ) {
    this.success = success;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.timestamp = new Date().toISOString();
    this.pagination = pagination;
  }

  /**
   * Create a success response
   */
  static ok<T>(data: T, message = 'Request successful', statusCode = 200, pagination: Pagination | null = null): ApiResponse<T> {
    return new ApiResponse<T>(true, statusCode, message, data, pagination);
  }



  /**
   * Create a created response (201)
   */
  static created<T>(data: T, message = 'Resource created successfully'): ApiResponse<T> {
    return new ApiResponse<T>(true, 201, message, data);
  }

  /**
   * Create a no-content response (204)
   */
  static noContent(message = 'No content'): ApiResponse<null> {
    return new ApiResponse<null>(true, 204, message, null);
  }

  /**
   * Create an error response
   */
  static error<T = null>(
    statusCode: number,
    message: string,
    data: T | null = null
  ): ApiResponse<T> {
    return new ApiResponse<T>(false, statusCode, message, data);
  }
}
