// Toast notification function
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="flex items-center">
            <div class="flex-shrink-0">
                ${type === 'success' 
                    ? '<i class="fas fa-check-circle text-green-500"></i>'
                    : type === 'error'
                    ? '<i class="fas fa-exclamation-circle text-red-500"></i>'
                    : '<i class="fas fa-info-circle text-blue-500"></i>'
                }
            </div>
            <div class="ml-3">
                <p class="text-sm font-medium text-gray-900">${message}</p>
            </div>
        </div>
    `;
    document.body.appendChild(toast);
    
    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Form validation
function validateTicketForm() {
    const title = document.getElementById('title');
    const description = document.getElementById('description');
    const category = document.getElementById('category');
    
    if (!title.value.trim()) {
        showToast('Please enter a ticket title', 'error');
        title.focus();
        return false;
    }
    
    if (!description.value.trim()) {
        showToast('Please enter a ticket description', 'error');
        description.focus();
        return false;
    }
    
    if (!category.value) {
        showToast('Please select a category', 'error');
        category.focus();
        return false;
    }
    
    return true;
}

// Dynamic comment loading
async function loadMoreComments(ticketId, skip = 0) {
    try {
        const response = await fetch(`/ticket/${ticketId}/comments?skip=${skip}`);
        const comments = await response.json();
        
        const commentsContainer = document.getElementById('comments-container');
        comments.forEach(comment => {
            const commentElement = createCommentElement(comment);
            commentsContainer.appendChild(commentElement);
        });
        
        if (comments.length === 0) {
            const loadMoreBtn = document.getElementById('load-more-btn');
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
        }
    } catch (error) {
        showToast('Error loading comments', 'error');
    }
}

// Create comment element
function createCommentElement(comment) {
    const div = document.createElement('div');
    div.className = 'bg-gray-50 rounded-lg p-4 mb-4';
    div.innerHTML = `
        <div class="flex space-x-3">
            <div class="flex-1">
                <p class="text-sm text-gray-900">${comment.content}</p>
                <div class="mt-1 text-sm text-gray-500">
                    <span>By ${comment.createdBy.username}</span>
                    <span class="mx-1">•</span>
                    <span>${new Date(comment.createdAt).toLocaleString()}</span>
                </div>
            </div>
        </div>
    `;
    return div;
}

// Real-time status updates
let statusUpdateTimeout;
function updateTicketStatus(ticketId, status) {
    clearTimeout(statusUpdateTimeout);
    
    const statusBadge = document.getElementById('status-badge');
    if (statusBadge) {
        statusBadge.className = `px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
            ${status === 'open' ? 'bg-green-100 text-green-800' : 
            status === 'in-progress' ? 'bg-yellow-100 text-yellow-800' : 
            'bg-gray-100 text-gray-800'}`;
        statusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }
    
    // Debounce the API call
    statusUpdateTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`/ticket/${ticketId}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status })
            });
            
            if (!response.ok) throw new Error('Failed to update status');
            showToast('Status updated successfully', 'success');
        } catch (error) {
            showToast('Error updating status', 'error');
        }
    }, 500);
}

// Initialize tooltips
document.addEventListener('DOMContentLoaded', function() {
    const tooltips = document.querySelectorAll('[data-tooltip]');
    tooltips.forEach(element => {
        element.addEventListener('mouseenter', e => {
            const tooltip = document.createElement('div');
            tooltip.className = 'absolute z-10 px-2 py-1 text-sm text-white bg-gray-900 rounded-md';
            tooltip.textContent = e.target.dataset.tooltip;
            tooltip.style.top = `${e.target.offsetTop - 30}px`;
            tooltip.style.left = `${e.target.offsetLeft}px`;
            document.body.appendChild(tooltip);
            
            element.addEventListener('mouseleave', () => tooltip.remove());
        });
    });
});

// Handle file uploads
function handleFileUpload(input) {
    const file = input.files[0];
    if (file) {
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            showToast('File size must be less than 5MB', 'error');
            input.value = '';
            return;
        }
        
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            showToast('Invalid file type. Please upload an image or PDF', 'error');
            input.value = '';
            return;
        }
        
        const fileName = document.getElementById('file-name');
        if (fileName) {
            fileName.textContent = file.name;
        }
    }
}

// Dark mode toggle function
function toggleDarkMode() {
    const html = document.documentElement;
    html.classList.toggle('dark');
    localStorage.setItem('darkMode', html.classList.contains('dark'));
}

// Initialize dark mode based on user preference
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('darkMode') === 'true') {
        document.documentElement.classList.add('dark');
    }
});