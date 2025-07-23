const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const {
  loadAllowList,
  isAllowed,
  runPipeline,
  SETTINGS_PATHS
} = require('./run_pipeline_if_allowed');

jest.mock('fs');
jest.mock('child_process');

describe('run_pipeline_if_allowed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset console mocks
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('loadAllowList', () => {
    it('should return empty array when no settings files exist', () => {
      fs.existsSync.mockReturnValue(false);
      
      const result = loadAllowList();
      
      expect(result).toEqual([]);
      expect(fs.existsSync).toHaveBeenCalledWith(path.resolve('.claude/settings.json'));
      expect(fs.existsSync).toHaveBeenCalledWith(path.resolve('.claude/settings.local.json'));
    });

    it('should load allow list from single settings file', () => {
      fs.existsSync.mockImplementation((filePath) => 
        filePath === path.resolve('.claude/settings.json')
      );
      
      const mockSettings = {
        permissions: {
          allow: ['Bash(echo)', 'Bash(ls)', 'Bash(pwd:*)']
        }
      };
      
      fs.readFileSync.mockReturnValue(JSON.stringify(mockSettings));
      
      const result = loadAllowList();
      
      expect(result).toEqual(['Bash(echo)', 'Bash(ls)', 'Bash(pwd:*)']);
      expect(fs.readFileSync).toHaveBeenCalledWith(
        path.resolve('.claude/settings.json'), 
        'utf8'
      );
    });

    it('should merge allow lists from multiple settings files', () => {
      fs.existsSync.mockReturnValue(true);
      
      const mockSettings1 = {
        permissions: {
          allow: ['Bash(echo)', 'Bash(ls)']
        }
      };
      
      const mockSettings2 = {
        permissions: {
          allow: ['Bash(pwd)', 'Bash(cat:*)']
        }
      };
      
      fs.readFileSync
        .mockReturnValueOnce(JSON.stringify(mockSettings1))
        .mockReturnValueOnce(JSON.stringify(mockSettings2));
      
      const result = loadAllowList();
      
      expect(result).toEqual(['Bash(echo)', 'Bash(ls)', 'Bash(pwd)', 'Bash(cat:*)']);
    });

    it('should deduplicate allow list entries', () => {
      fs.existsSync.mockReturnValue(true);
      
      const mockSettings1 = {
        permissions: {
          allow: ['Bash(echo)', 'Bash(ls)']
        }
      };
      
      const mockSettings2 = {
        permissions: {
          allow: ['Bash(echo)', 'Bash(pwd)']
        }
      };
      
      fs.readFileSync
        .mockReturnValueOnce(JSON.stringify(mockSettings1))
        .mockReturnValueOnce(JSON.stringify(mockSettings2));
      
      const result = loadAllowList();
      
      expect(result).toEqual(['Bash(echo)', 'Bash(ls)', 'Bash(pwd)']);
    });

    it('should handle empty permissions object', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({}));
      
      const result = loadAllowList();
      
      expect(result).toEqual([]);
    });

    it('should handle missing allow array', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        permissions: {}
      }));
      
      const result = loadAllowList();
      
      expect(result).toEqual([]);
    });
  });

  describe('isAllowed', () => {
    const allowList = [
      'Bash(echo)',
      'Bash(ls)',
      'Bash(pwd:*)',
      'Bash(git status)',
      'Bash(npm run test:*)'
    ];

    it('should allow exact command matches', () => {
      expect(isAllowed('echo', allowList)).toBe(true);
      expect(isAllowed('ls', allowList)).toBe(true);
    });

    it('should allow commands with wildcards', () => {
      expect(isAllowed('pwd', allowList)).toBe(true);
      expect(isAllowed('pwd /some/path', allowList)).toBe(true);
      // For npm run test:*, we need the prefix to match "npm run test"
      expect(isAllowed('npm run test extra-args', allowList)).toBe(true);
      expect(isAllowed('npm run test --watch --coverage', allowList)).toBe(true);
    });

    it('should allow multi-word commands', () => {
      expect(isAllowed('git status', allowList)).toBe(true);
    });

    it('should match by progressive prefix matching', () => {
      expect(isAllowed('git status --porcelain', allowList)).toBe(true);
      expect(isAllowed('git status -s', allowList)).toBe(true);
    });

    it('should deny commands not in allow list', () => {
      expect(isAllowed('rm', allowList)).toBe(false);
      expect(isAllowed('cat /etc/passwd', allowList)).toBe(false);
      expect(isAllowed('git push', allowList)).toBe(false);
    });

    it('should allow commands that match exact patterns without wildcards', () => {
      // These should be allowed because they match exactly or have progressive prefix matching
      expect(isAllowed('echo hello world', allowList)).toBe(true); // matches Bash(echo)
      expect(isAllowed('ls -la', allowList)).toBe(true); // matches Bash(ls)
    });

    it('should handle empty command', () => {
      expect(isAllowed('', allowList)).toBe(false);
    });

    it('should handle empty allow list', () => {
      expect(isAllowed('echo', [])).toBe(false);
    });
  });

  describe('runPipeline', () => {
    beforeEach(() => {
      // Mock fs to return a settings file with specific permissions
      fs.existsSync.mockImplementation((filePath) => 
        filePath === path.resolve('.claude/settings.json')
      );
      
      const mockSettings = {
        permissions: {
          allow: [
            'Bash(echo)',
            'Bash(ls)',
            'Bash(grep:*)',
            'Bash(sort)'
          ]
        }
      };
      
      fs.readFileSync.mockReturnValue(JSON.stringify(mockSettings));
    });

    it('should exit with error when no arguments provided', () => {
      runPipeline([]);
      
      expect(console.error).toHaveBeenCalledWith('❌ Usage: node run_pipeline.js <cmd1> | <cmd2> | ...');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should execute allowed single command', () => {
      execSync.mockReturnValue('output');
      
      runPipeline(['echo', 'hello']);
      
      expect(execSync).toHaveBeenCalledWith('echo hello', {
        stdio: 'inherit',
        shell: '/bin/bash'
      });
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('should execute allowed pipeline commands', () => {
      execSync.mockReturnValue('output');
      
      runPipeline(['echo', 'hello', '|', 'grep', 'h', '|', 'sort']);
      
      expect(execSync).toHaveBeenCalledWith('echo hello | grep h | sort', {
        stdio: 'inherit',
        shell: '/bin/bash'
      });
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('should reject pipeline with disallowed command', () => {
      runPipeline(['rm', 'file.txt', '|', 'echo', 'hello']);
      
      expect(console.error).toHaveBeenCalledWith('⛔ Not allowed: rm file.txt');
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should reject single disallowed command', () => {
      runPipeline(['rm', '-rf', '/']);
      
      expect(console.error).toHaveBeenCalledWith('⛔ Not allowed: rm -rf /');
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should handle execution errors', () => {
      const error = new Error('Command failed');
      error.status = 2;
      execSync.mockImplementation(() => {
        throw error;
      });
      
      runPipeline(['echo', 'hello']);
      
      expect(process.exit).toHaveBeenCalledWith(2);
    });

    it('should handle execution errors without status', () => {
      const error = new Error('Command failed');
      execSync.mockImplementation(() => {
        throw error;
      });
      
      runPipeline(['echo', 'hello']);
      
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should validate each segment of complex pipeline', () => {
      runPipeline(['rm', '|', 'ls', '|', 'grep', 'test']);
      
      expect(console.error).toHaveBeenCalledWith('⛔ Not allowed: rm');
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should trim whitespace from pipeline segments', () => {
      execSync.mockReturnValue('output');
      
      runPipeline(['echo', 'hello', '|', ' grep ', 'h ', '|', ' sort']);
      
      expect(execSync).toHaveBeenCalledWith('echo hello |  grep  h  |  sort', {
        stdio: 'inherit',
        shell: '/bin/bash'
      });
    });
  });

  describe('SETTINGS_PATHS constant', () => {
    it('should contain correct settings file paths', () => {
      expect(SETTINGS_PATHS).toEqual([
        path.resolve('.claude/settings.json'),
        path.resolve('.claude/settings.local.json')
      ]);
    });
  });

  describe('integration scenarios', () => {
    beforeEach(() => {
      // Reset all mocks for integration tests
      jest.clearAllMocks();
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(process, 'exit').mockImplementation(() => {});
    });

    it('should work end-to-end with real file system mocking', () => {
      // Mock file system
      fs.existsSync.mockImplementation((filePath) => 
        filePath === path.resolve('.claude/settings.json')
      );
      
      const mockSettings = {
        permissions: {
          allow: ['Bash(echo:*)', 'Bash(grep:*)', 'Bash(sort)']
        }
      };
      
      fs.readFileSync.mockReturnValue(JSON.stringify(mockSettings));
      execSync.mockReturnValue('mocked output');
      
      // Execute pipeline
      runPipeline(['echo', 'test', '|', 'grep', 'e', '|', 'sort']);
      
      // Verify file system calls
      expect(fs.existsSync).toHaveBeenCalledWith(path.resolve('.claude/settings.json'));
      expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve('.claude/settings.json'), 'utf8');
      
      // Verify execution
      expect(execSync).toHaveBeenCalledWith('echo test | grep e | sort', {
        stdio: 'inherit',
        shell: '/bin/bash'
      });
      
      expect(process.exit).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });
  });
});