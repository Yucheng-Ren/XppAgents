import { useState } from 'react';

export default function ProjectSwitcher({
  activeProject,
  projects,
  onSwitch,
  onCreate,
  onDelete,
}) {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [error, setError] = useState('');

  const projectNames = Object.keys(projects || {});

  async function handleSwitch(name) {
    await onSwitch(name);
    setOpen(false);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await onCreate({ name: newName.trim(), solutionPath: newPath.trim(), description: newDesc.trim() });
      setNewName('');
      setNewPath('');
      setNewDesc('');
      setShowCreate(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(name, e) {
    e.stopPropagation();
    if (!confirm(`Delete project "${name}"? This removes the project config (data files are kept).`)) return;
    await onDelete(name);
  }

  return (
    <div className="project-switcher">
      <button
        className="project-switcher-btn"
        onClick={() => setOpen(!open)}
        title="Switch project"
      >
        <span className="project-icon">📁</span>
        <span className="project-name">{activeProject || 'No project'}</span>
        <span className="project-arrow">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="project-dropdown">
          {projectNames.length === 0 && !showCreate && (
            <div className="project-empty">No projects configured</div>
          )}

          {projectNames.map((name) => (
            <button
              key={name}
              className={`project-item ${name === activeProject ? 'active' : ''}`}
              onClick={() => handleSwitch(name)}
            >
              <span className="project-item-name">
                {name}
                {name === activeProject && <span className="active-dot" />}
              </span>
              <span className="project-item-path" title={projects[name].solutionPath}>
                {projects[name].description || projects[name].solutionPath}
              </span>
              {projectNames.length > 1 && (
                <button
                  className="project-delete-btn"
                  onClick={(e) => handleDelete(name, e)}
                  title="Delete project"
                >
                  ✕
                </button>
              )}
            </button>
          ))}

          {showCreate ? (
            <form className="project-create-form" onSubmit={handleCreate}>
              <input
                type="text"
                placeholder="Project name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                autoFocus
              />
              <input
                type="text"
                placeholder="Solution path (e.g. C:\repos\MyProject)"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                required
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
              {error && <div className="project-error">{error}</div>}
              <div className="project-create-actions">
                <button type="submit" className="project-create-submit">Create</button>
                <button type="button" className="project-create-cancel" onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <button className="project-add-btn" onClick={() => setShowCreate(true)}>
              + New Project
            </button>
          )}
        </div>
      )}
    </div>
  );
}
