export const validateEmployeeId = (id: string | null | undefined): { isValid: boolean; error?: string } => {
  if (!id || id.trim() === '') {
    return { isValid: false, error: 'Employee ID is required.' };
  }
  
  const trimmedId = id.trim();
  
  // Accept any string with at least 2 characters (alphanumeric, dashes, etc.)
  if (trimmedId.length < 2) {
    return { 
      isValid: false, 
      error: 'Employee ID must be at least 2 characters long.' 
    };
  }

  return { isValid: true };
};
