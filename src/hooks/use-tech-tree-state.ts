"use client"

import type React from "react"

import { useState, useEffect, useMemo, useRef } from "react"
import type { TechNode, NewDevelopment } from "@/lib/types/tech-tree"
import { getEraForYear, getCenturyForYear } from "@/utils/tech-tree-utils"
import { supabase, supabaseConfigured } from "@/lib/supabaseClient"
import { loadJSON, saveJSON } from "@/utils/storage"


export const useTechTreeState = (initialNodes: TechNode[] = []) => {
    // --- LAYER 1: Persistent nodes from the database ---
    const [persistentNodes, setPersistentNodes] = useState<TechNode[]>(initialNodes)
    // --- LAYER 2: Temporary nodes for the current session ---
    const [sessionNodes, setSessionNodes] = useState<TechNode[]>([])
    // --- COMBINED VIEW: A memoized array for the UI to render
    const techNodes = useMemo(() => {
      // We combine persistent and session nodes into one array for rendering.
      return [...persistentNodes, ...sessionNodes]
    }, [persistentNodes, sessionNodes])
    const [selectedNode, setSelectedNode] = useState<TechNode | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [addDialogOpen, setAddDialogOpen] = useState(false)
    const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([])
    const [isMounted, setIsMounted] = useState(false)
    const [collapsedEras, setCollapsedEras] = useState<string[]>([])
    const firstLoadDone = useRef(false)

  // New development form state
  const [newDevelopment, setNewDevelopment] = useState<NewDevelopment>({
    title: "",
    year: 800,
    yearType: "BCE",
    description: "",
    category: [],
    links: [],
    dependencies: [],
  })

  const [newLink, setNewLink] = useState({ title: "", url: "" })

  // this useEffect now ONLY manages persistent data from supabase
  useEffect(() => {
    // Set the initial persistent nodes from the server props
    setPersistentNodes(initialNodes)

    if (!supabaseConfigured) return

    const channel = supabase.channel('realtime-developments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'developments' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newNode = { ...payload.new, expanded: false } as TechNode
            setPersistentNodes((currentNodes) => [...currentNodes, newNode])
          }

          if (payload.eventType === 'UPDATE') {
            const updatedNode = payload.new as TechNode
            setPersistentNodes((currentNodes) =>
              currentNodes.map((node) =>
                node.id === updatedNode.id ? { ...node, ...updatedNode } : node
              )
            )
          }

          if (payload.eventType === 'DELETE') {
            const deletedNodeId = payload.old.id
            setPersistentNodes((currentNodes) => {
                let updated = currentNodes.filter((node) => node.id !== deletedNodeId);
                updated = updated.map(node => ({
                    ...node,
                    dependencies: node.dependencies?.filter(dep => dep !== deletedNodeId) ?? []
                  }));
                return updated;
            });
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [initialNodes])

  // Set isMounted to true after component mounts
  useEffect(() => {
    // Load persisted UI state once on mount
    const storedCollapsed = loadJSON<string[]>("collapsedEras", [])
    const storedFilters = loadJSON<string[]>("selectedFilters", [])
    if (storedCollapsed.length) setCollapsedEras(storedCollapsed)
    if (storedFilters.length) setSelectedFilterTags(storedFilters)
    firstLoadDone.current = true
    setIsMounted(true)
  }, [])

  // Persist collapsed eras when they change
  useEffect(() => {
    if (!firstLoadDone.current) return
    saveJSON("collapsedEras", collapsedEras)
  }, [collapsedEras])

  // Persist selected filter tags when they change
  useEffect(() => {
    if (!firstLoadDone.current) return
    saveJSON("selectedFilters", selectedFilterTags)
  }, [selectedFilterTags])

  // Toggle era collapse state
  const toggleEraCollapse = (eraId: string) => {
    setCollapsedEras((prev) => (prev.includes(eraId) ? prev.filter((id) => id !== eraId) : [...prev, eraId]))
  }

  // Toggle node expansion state
  const toggleNodeExpansion = (nodeId: string | number) => {
    if (typeof nodeId === "string" && nodeId.startsWith("session-")) {
      setSessionNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, expanded: !n.expanded } : n)))
    } else {
      setPersistentNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, expanded: !n.expanded } : n)))
    }
  }

  // Open node details dialog
  const openNodeDetails = (node: TechNode) => {
    setSelectedNode(node)
    setDialogOpen(true)
  }

  // Toggle filter tag
  const toggleFilterTag = (tag: string) => {
    setSelectedFilterTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag)
      } else {
        return [...prev, tag]
      }
    })
  }

  // Clear all filters
  const clearFilters = () => {
    setSelectedFilterTags([])
  }

  // Handle input change for new development
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setNewDevelopment((prev) => ({
      ...prev,
      [name]: name === "year" ? (value === "" ? "" : Number(value)) : value,
    }))
  }

  // Handle year type change
  const handleYearTypeChange = (type: "BCE" | "CE") => {
    setNewDevelopment(prev => {
      const currentYear = Number(prev.year);
      if (isNaN(currentYear)) {
        return { ...prev, yearType: type };
      }
      
      const year = type === "BCE" ? -Math.abs(currentYear) : Math.abs(currentYear);
      
      return {
        ...prev,
        yearType: type,
        year: year,
      };
    });
  };

  // Handle dependency selection
  const handleDependencyToggle = (nodeId: string) => {
    setNewDevelopment((prev) => {
      if (prev.dependencies.includes(nodeId)) {
        return {
          ...prev,
          dependencies: prev.dependencies.filter((id) => id !== nodeId),
        }
      } else {
        return {
          ...prev,
          dependencies: [...prev.dependencies, nodeId],
        }
      }
    })
  }

  // Add a new link to the development
  const addLink = () => {
    if (newLink.title && newLink.url) {
      setNewDevelopment((prev) => ({
        ...prev,
        links: [...prev.links, { ...newLink }],
      }))
      setNewLink({ title: "", url: "" })
    }
  }

  // Remove a link from the development
  const removeLink = (index: number) => {
    setNewDevelopment((prev) => ({
      ...prev,
      links: prev.links.filter((_, i) => i !== index),
    }))
  }

  // Toggle a tag in the new development form
  const handleTagToggle = (tag: string) => {
    setNewDevelopment((prev) => {
      if (prev.category.includes(tag)) {
        return {
          ...prev,
          category: prev.category.filter((t) => t !== tag),
        }
      } else {
        return {
          ...prev,
          category: [...prev.category, tag],
        }
      }
    })
  }

  // This function now ONLY adds to the session state ---
  const saveDevelopment = () => {
    if (!newDevelopment.title) {
      alert("Please enter a title for the development")
      return
    }

    // Generate a session-unique ID to prevent clashes with DB keys.
    const id = `session-${crypto.randomUUID()}`
    const year = newDevelopment.yearType === "BCE" ? -Math.abs(newDevelopment.year) : Math.abs(newDevelopment.year)
    const era = getEraForYear(year)
    const century = getCenturyForYear(year)

    const development: TechNode = {
      ...newDevelopment,
      id,
      year,
      era: era?.id || "",
      century: century?.id || "",
      expanded: false,
    }

    // Add the new development to the SESSION list
    setSessionNodes((prev) => [...prev, development])

    // Reset the form and close the dialog
    setNewDevelopment({
      title: "", year: 800, yearType: "BCE", description: "", category: [], links: [], dependencies: [],
    })
    setAddDialogOpen(false)
  }

  const removeNodeFromSession = (nodeId: string) => {
    setSessionNodes((prev) => prev.filter((node) => node.id !== nodeId));
    // Also remove as a dependency from other session nodes
    setSessionNodes((prev) => prev.map(n => ({
        ...n,
        dependencies: n.dependencies?.filter(dep => dep !== nodeId)
    })));
    // Close the dialog if the deleted node was selected
    if (selectedNode && String(selectedNode.id) === String(nodeId)) {
        setDialogOpen(false);
    }
  };

  return {
    // State
    techNodes,
    selectedNode,
    dialogOpen,
    setDialogOpen,
    addDialogOpen,
    setAddDialogOpen,
    selectedFilterTags,
    isMounted,
    collapsedEras,
    newDevelopment,
    newLink,
    setNewLink,

    // Actions
    toggleEraCollapse,
    toggleNodeExpansion,
    openNodeDetails,
    toggleFilterTag,
    clearFilters,
    handleInputChange,
    handleYearTypeChange,
    handleDependencyToggle,
    addLink,
    removeLink,
    handleTagToggle,
    saveDevelopment,
    removeNodeFromSession,
  }
}
