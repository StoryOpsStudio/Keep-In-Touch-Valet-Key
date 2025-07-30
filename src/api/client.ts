const API_BASE = '/api';

class ApiClient {
  private getHeaders() {
    return {
      'Content-Type': 'application/json',
    };
  }

  async request(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  // Contact methods
  async getContacts(params: { page?: number; limit?: number; search?: string; category?: string } = {}) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, value.toString());
    });
    
    return this.request(`/contacts?${searchParams}`);
  }

  async importContacts(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE}/contacts/import`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Import failed' }));
      throw new Error(error.error || 'Import failed');
    }

    return response.json();
  }

  async getImportHistory() {
    return this.request('/contacts/imports');
  }

  downloadTemplate() {
    window.open(`${API_BASE}/contacts/template`, '_blank');
  }
}

export const apiClient = new ApiClient();