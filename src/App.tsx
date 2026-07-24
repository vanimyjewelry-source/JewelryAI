import React, { useState, useEffect } from 'react';
import { 
  Layout, 
  Settings, 
  Plus, 
  Layers, 
  Download, 
  Trash2, 
  Box,
  Sparkles,
  Maximize2,
  FolderOpen,
  Key,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronRight,
  Image as ImageIcon,
  User,
  Monitor,
  X,
  FileText,
  Video,
  Megaphone,
  Check,
  Search,
  Ruler,
  Edit2,
  Eye,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { io } from 'socket.io-client';

// --- Types ---
type StandardCategory = 'Ring' | 'necklace' | 'necklace with pendant' | 'charms & pendants' | 'earrings' | 'bracelet' | 'hand chain' | 'All';
type WorkflowType = 'MainImage' | 'DetailAssets' | 'VideoAssets' | 'Library' | 'Standards' | 'Agent';

interface AnalysisData {
  sku?: string;
  category?: string;
  material?: string;
  weight?: string;
  size?: string;
  notes?: string;
}

interface VideoType {
  id: string;
  name: string;
  prompt: string;
}

interface Standard {
  id: string;
  name: string;
  type: string; // Dynamic category (e.g., 'Main', 'Model', 'Scene', 'VI', 'AD', 'Component')
  category: StandardCategory;
  subCategory?: string; // e.g., 'Wide Band', 'Thin Band', 'Vertical Drop', 'Horizontal Bar'
  metal: 'Silver' | 'Gold Vermeil' | '14k Gold' | 'All';
  stone: 'Diamond' | 'Sapphire' | 'Ruby' | 'Emerald' | 'All';
  prompt?: string;
  componentIds?: string[]; // IDs of other standards to inherit prompts from (e.g., a shared Chain standard)
  backgroundColor?: string;
  referenceImage?: string; // Legacy support
  referenceImages?: string[]; // Array of reference images for multi-image training
  rules: {
    composition: string;
    lighting: string;
    size: string;
  };
  stoneLibraryData?: {
    sharedBaseRules?: string;
    negativePrompt?: string;
    colorAdjustments?: Record<string, string>;
    cutAdjustments?: Record<string, string>;
    categoryAdjustments?: Record<string, string>;
  };
  // VI Specific
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  // AD Specific (PMax)
  headlines?: string[];
  longHeadlines?: string[];
  descriptions?: string[];
  callToAction?: string;
  businessName?: string;
}

interface ProductSpecs {
  material: string;
  weight: string;
  size: string;
  notes?: string;
}

interface ProductRegistryEntry {
  sku: string;
  category: StandardCategory;
  specs: ProductSpecs;
  mainImage?: string;
  mainImages?: { metal: string; url: string }[];
  lastUpdated: string;
}

interface SKUProject {
  id: string;
  sku: string;
  workflow: WorkflowType;
  category: Standard['category'];
  specs: ProductSpecs;
  threeViewSources: string[]; // Support multiple source images
  threeViews: {
    front?: string;
    side?: string;
    back?: string;
  };
  status: 'input' | 'calibrating' | 'calibrated' | 'deriving' | 'completed';
  mainImage?: string;
  mainImages?: { metal: string; url: string }[]; // For Main workflow multi-metal
  mainItem?: string; // For Detail workflow
  matchingItem?: string; // For Detail workflow
  detailTypes?: string[]; // For Detail workflow
  derivedAssets: {
    type: string;
    url: string;
    status: 'pending' | 'completed';
  }[];
  matchingSkus: string[];
  standardId: string; // Main Standard
  placeholderId?: string; // Placeholder Standard
  metalId?: string; // Metal Standard
}

// --- Constants ---
const INITIAL_STANDARDS: Standard[] = [
  // --- 组件标准 (Components) ---
  {
    id: 'std-comp-chain-15',
    name: 'Master Chain (1.5mm)',
    type: 'Component',
    category: 'necklace',
    subCategory: 'Chain',
    metal: 'All',
    stone: 'All',
    prompt: 'The necklace chain is a 1.5mm delicate cable chain with a high-polish finish, consistent link size, and a subtle shimmer. Ensure the chain links are perfectly uniform and follow a smooth, natural curve.',
    rules: { composition: 'Detail', lighting: 'Macro', size: '2000x2000' }
  },

  // --- 占位标准 (Placeholder Standards - Artist Grade) ---
  {
    id: 'std-placeholder-ring',
    name: 'Ring (Artist Std)',
    type: 'Placeholder',
    category: 'Ring',
    subCategory: 'Standard',
    metal: 'All',
    stone: 'All',
    prompt: 'Artist Verification Standard: Position the ring at a precise 45-degree angle. Align the center of gravity with the vertical axis. Ensure the perspective matches the reference silhouette exactly for seamless overlay.',
    referenceImage: 'https://picsum.photos/seed/ring-std/800/800',
    rules: { composition: '45° Angle', lighting: 'Artist Guide', size: '2000x2000' }
  },
  {
    id: 'std-placeholder-necklace',
    name: 'Necklace (Artist Std)',
    type: 'Placeholder',
    category: 'necklace',
    subCategory: 'Standard',
    metal: 'All',
    stone: 'All',
    componentIds: ['std-comp-chain-15'],
    prompt: 'Artist Verification Standard: Standard necklace alignment, centered, with a natural circular or oval drape. The pendant or main focal point must exactly match the geometry and intricate details of the provided 3D source drawing. CRITICAL: If the input 3D drawing does not show a chain, you MUST render a high-quality jewelry chain based on the reference image provided, ensuring it follows a smooth, natural curve that complements the pendant design.',
    referenceImage: 'https://picsum.photos/seed/regular-necklace-std/800/800',
    rules: { composition: 'Regular', lighting: 'Artist Guide', size: '2000x2000' }
  },
  {
    id: 'std-placeholder-necklace-pendant',
    name: 'Necklace with Pendant (Artist Std)',
    type: 'Placeholder',
    category: 'necklace with pendant',
    subCategory: 'Standard',
    metal: 'All',
    stone: 'All',
    componentIds: ['std-comp-chain-15'],
    prompt: 'Artist Verification Standard: Align the necklace with a secondary chain drop holding a pendant. The main chain should form a circle or V-shape, and a separate chain segment must hang vertically from the center, terminating in a pendant. CRITICAL: If the input 3D drawing does not show a chain, you MUST render a high-quality jewelry chain based on the reference image provided, ensuring the drop length and pendant size match the reference guide.',
    referenceImage: 'https://picsum.photos/seed/necklace-pendant-drop/800/800',
    rules: { composition: 'Chain Drop', lighting: 'Artist Guide', size: '2000x2000' }
  },
  {
    id: 'std-placeholder-charms',
    name: 'Charms & Pendants (Artist Std)',
    type: 'Placeholder',
    category: 'charms & pendants',
    subCategory: 'Standard',
    metal: 'All',
    stone: 'All',
    prompt: 'Artist Verification Standard: Position the charm/pendant in isolation. No chain should be visible. Focus on the front-facing geometric details and bail structure. Ensure the item is perfectly centered and upright.',
    referenceImage: 'https://picsum.photos/seed/charms-std/800/800',
    rules: { composition: 'Isolated', lighting: 'Artist Guide', size: '2000x2000' }
  },
  {
    id: 'std-placeholder-earrings',
    name: 'Earrings (Artist Std)',
    type: 'Placeholder',
    category: 'earrings',
    subCategory: 'Standard',
    metal: 'All',
    stone: 'All',
    prompt: 'Artist Verification Standard: Position a pair of earrings symmetrically. Focus on the front-facing stone setting and metal prongs. Maintain a precise horizontal alignment matching the reference template.',
    referenceImage: 'https://picsum.photos/seed/earring-std/800/800',
    rules: { composition: 'Symmetrical Pair', lighting: 'Artist Guide', size: '2000x2000' }
  },
  {
    id: 'std-placeholder-bracelet',
    name: 'Bracelet (Artist Std)',
    type: 'Placeholder',
    category: 'bracelet',
    subCategory: 'Standard',
    metal: 'All',
    stone: 'All',
    prompt: 'Artist Verification Standard: Position the bracelet in a natural circular drape. Focus on the link uniformity and the clasp detail. The curvature must match the reference template exactly.',
    referenceImage: 'https://picsum.photos/seed/bracelet-std/800/800',
    rules: { composition: 'Circular Drape', lighting: 'Artist Guide', size: '2000x2000' }
  },
  {
    id: 'std-placeholder-hand-chain',
    name: 'Hand Chain (Artist Std)',
    type: 'Placeholder',
    category: 'hand chain',
    subCategory: 'Standard',
    metal: 'All',
    stone: 'All',
    prompt: 'Artist Verification Standard: Align the hand chain in a spread layout, clearly showing the wrist and finger connections as defined by the reference image guide. Ensure all chain segments are visible and follow the natural hand anatomy.',
    referenceImage: 'https://picsum.photos/seed/handchain-placeholder/800/800',
    rules: { composition: 'Spread Layout', lighting: 'Artist Guide', size: '2000x2000' }
  },

  // --- 主图/场景标准 (Main/Scene Standards) ---
  {
    id: 'std-main-white',
    name: 'Main Image (Pure White)',
    type: 'Main',
    category: 'All',
    metal: 'All',
    stone: 'All',
    backgroundColor: '#FAFAFA',
    prompt: 'Pure white background (#FAFAFA), professional studio lighting, soft shadows at the base, high-end jewelry catalog style.',
    rules: { composition: 'Centered', lighting: 'Studio Neutral', size: '2000x2000' }
  },
  {
    id: 'std-metal-silver',
    name: 'Silver Texture',
    type: 'Metal',
    category: 'All',
    metal: 'Silver',
    stone: 'All',
    prompt: 'Hyper-realistic sterling silver texture, cool reflections, polished finish, high contrast',
    rules: { composition: 'Texture Only', lighting: 'Cool Studio', size: '2000x2000' }
  },
  {
    id: 'std-metal-14k-gold',
    name: '14K Gold Texture',
    type: 'Metal',
    category: 'All',
    metal: '14k Gold',
    stone: 'All',
    prompt: 'Hyper-realistic 14K yellow gold texture, rich warm yellow gold, high-end jewelry finish',
    rules: { composition: 'Texture Only', lighting: 'Warm Studio', size: '2000x2000' }
  },
  {
    id: 'std-metal-gold-vermeil',
    name: 'Gold Vermeil Texture',
    type: 'Metal',
    category: 'All',
    metal: 'Gold Vermeil',
    stone: 'All',
    prompt: 'Hyper-realistic gold vermeil texture (18K gold over sterling silver), rich 16K gold color, high-end jewelry finish, subtle silver undertones in deep crevices',
    rules: { composition: 'Texture Only', lighting: 'Warm Studio', size: '2000x2000' }
  },
  {
    id: 'std-scene-ring-marble',
    name: 'Ring Scene (Marble)',
    type: 'Scene',
    category: 'Ring',
    metal: 'All',
    stone: 'All',
    prompt: 'Luxury ring on white marble surface, soft morning light, shallow depth of field, elegant atmosphere',
    rules: { composition: 'Lifestyle', lighting: 'Natural Light', size: '2000x2000' }
  },
  {
    id: 'std-scene-necklace-wood',
    name: 'Necklace Scene (Wood)',
    type: 'Scene',
    category: 'necklace',
    metal: 'All',
    stone: 'All',
    prompt: 'Necklace on dark walnut wood, dramatic spotlight, high contrast, luxury feel',
    rules: { composition: 'Lifestyle', lighting: 'Spotlight', size: '2000x2000' }
  },
  {
    id: 'std-scene-ring-sand',
    name: 'Ring Scene (Sand)',
    type: 'Scene',
    category: 'Ring',
    metal: 'All',
    stone: 'All',
    prompt: 'A ring partially buried in fine white sand, beach vibe, bright sunlight, summer jewelry collection.',
    rules: { composition: 'Organic', lighting: 'Bright Sun', size: '2000x2000' }
  },
  {
    id: 'std-vi-default',
    name: 'Brand VI (Default)',
    type: 'VI',
    category: 'All',
    metal: 'All',
    stone: 'All',
    primaryColor: '#10B981',
    secondaryColor: '#111111',
    fontFamily: 'Inter',
    referenceImage: 'https://picsum.photos/seed/logo/200/200',
    rules: { composition: 'Brand Identity', lighting: 'Flat', size: 'Vector' }
  },
  {
    id: 'std-ad-pmax',
    name: 'Google PMax AD Standard',
    type: 'AD',
    category: 'All',
    metal: 'All',
    stone: 'All',
    businessName: 'JewelryAI',
    headlines: ['Luxury Jewelry', 'Handcrafted Elegance', 'Timeless Beauty'],
    longHeadlines: ['Discover the finest handcrafted jewelry for every occasion'],
    descriptions: ['Shop our exclusive collection of rings, necklaces, and more.'],
    callToAction: 'Shop Now',
    rules: { composition: 'Multi-Asset', lighting: 'Dynamic', size: 'Responsive' }
  }
];

// --- AI Studio API Key Helpers ---
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const VIDEO_TYPES: VideoType[] = [
  { id: 'rotating', name: '360° Rotating', prompt: 'A smooth 360-degree rotation of the jewelry item on a clean white background, professional studio lighting.' },
  { id: 'assembly', name: 'Exploded/Assembly', prompt: 'A cinematic assembly video where the individual components of the jewelry piece fly together to form the final product.' },
  { id: 'detail', name: 'Detail Showcase', prompt: 'A series of close-up macro shots highlighting the craftsmanship, stone setting, and metal texture of the jewelry.' },
  { id: 'lifestyle', name: 'Lifestyle / Model', prompt: 'A high-end fashion video featuring a model wearing the jewelry in a natural, elegant setting.' },
  { id: 'creative', name: 'Creative / Artistic', prompt: 'An artistic and abstract presentation of the jewelry with dramatic lighting and unique compositions.' }
];

export default function App() {
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowType>('MainImage');
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return localStorage.getItem('gemini-custom-api-key') || '';
  });
  const [isSettingKey, setIsSettingKey] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  
  // --- Main Image Generator State ---
  const [mainImageData, setMainImageData] = useState({
    sku: '',
    fourViewSource: '', // Single image with multiple views
    targetMetal: 'std-metal-silver',
    standardId: 'std-main-white',
    placeholderId: 'std-placeholder-ring',
    stoneId: '',
    mainStone: '',
    mainStoneColor: '',
    stoneCut: '',
    sideStone: '',
    sideStoneColor: '',
    status: 'idle' as 'idle' | 'generating' | 'completed' | 'failed',
    generatedUrl: '',
    customPlaceholderSource: '',
  });

  // --- Detail Assets Generator State ---
  const [detailAssetsData, setDetailAssetsData] = useState({
    mainItemSku: '',
    matchingItemSku: '',
    sceneStandardId: '',
    modelStandardId: '',
    sizeRefSource: '', // 3D drawing for size control
    status: 'idle' as 'idle' | 'generating' | 'completed' | 'failed',
    results: {
      mainScene: '',
      setScene: '',
      mainModel: '',
      setModel: ''
    }
  });

  // --- Video Assets Generator State ---
  const [videoAssetsData, setVideoAssetsData] = useState({
    mainItemSku: '',
    videoTypeId: 'rotating',
    standardId: '',
    status: 'idle' as 'idle' | 'generating' | 'completed' | 'failed',
    generatedUrl: '',
    currentStep: ''
  });

  const [projects, setProjects] = useState<SKUProject[]>(() => {
    try {
      const saved = localStorage.getItem('jewelry-ai-projects');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [productRegistry, setProductRegistry] = useState<ProductRegistryEntry[]>(() => {
    try {
      const saved = localStorage.getItem('jewelry-ai-product-registry');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [refiningAsset, setRefiningAsset] = useState<{ projectId: string, assetType: string, url: string } | null>(null);
  const [refinementPrompt, setRefinementPrompt] = useState('');
  const [isAddingAsset, setIsAddingAsset] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    const checkApiKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkApiKey();
  }, []);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [standards, setStandards] = useState<Standard[]>(() => {
    try {
      const saved = localStorage.getItem('jewelry-ai-standards-v2');
      const savedStandards: Standard[] = saved ? JSON.parse(saved) : [];
      
      // Merge logic: User's saved standards take precedence for existing IDs,
      // but new default standards from code updates are added.
      const merged = [...INITIAL_STANDARDS];
      savedStandards.forEach(savedStd => {
        const index = merged.findIndex(s => s.id === savedStd.id);
        if (index !== -1) {
          merged[index] = savedStd; // Overwrite default with user's version
        } else {
          merged.push(savedStd); // Add user's custom standard
        }
      });
      return merged;
    } catch (e) {
      return INITIAL_STANDARDS;
    }
  });

  // Auto-select standards based on SKU from registry
  useEffect(() => {
    if (mainImageData.sku) {
      const existingProduct = productRegistry.find(p => p.sku === mainImageData.sku);
      if (existingProduct) {
        // Find matching placeholder standard for the category
        const bestPlaceholder = standards.find(s => s.type === 'Placeholder' && s.category === existingProduct.category);
        if (bestPlaceholder) {
          setMainImageData(prev => ({
            ...prev,
            placeholderId: bestPlaceholder.id
          }));
        }
      }
    }
  }, [mainImageData.sku, productRegistry, standards]);

  useEffect(() => {
    try {
      localStorage.setItem('jewelry-ai-projects', JSON.stringify(projects));
      
      // Auto-sync completed main images to registry
      const completedMainProjects = projects.filter(p => p.workflow === 'Main' && (p.mainImage || (p.mainImages && p.mainImages.some(mi => mi.url))));
      setProductRegistry(prev => {
        let updated = [...prev];
        let changed = false;
        completedMainProjects.forEach(p => {
          const existingIdx = updated.findIndex(entry => entry.sku === p.sku);
          const newEntry: ProductRegistryEntry = {
            sku: p.sku,
            category: p.category,
            specs: p.specs,
            mainImage: p.mainImage,
            mainImages: p.mainImages,
            lastUpdated: new Date().toISOString()
          };
          
          if (existingIdx >= 0) {
            const existing = updated[existingIdx];
            if (JSON.stringify(existing.specs) !== JSON.stringify(p.specs) || existing.mainImage !== p.mainImage || JSON.stringify(existing.mainImages) !== JSON.stringify(p.mainImages)) {
              updated[existingIdx] = newEntry;
              changed = true;
            }
          } else {
            updated.push(newEntry);
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
    } catch (e) {
      console.error("Failed to save projects to localStorage:", e);
    }
  }, [projects]);

  useEffect(() => {
    try {
      localStorage.setItem('jewelry-ai-product-registry', JSON.stringify(productRegistry));
    } catch (e) {
      console.error("Failed to save registry to localStorage:", e);
    }
  }, [productRegistry]);

  useEffect(() => {
    try {
      localStorage.setItem('jewelry-ai-standards-v2', JSON.stringify(standards));
    } catch (e) {
      console.error("Failed to save standards to localStorage:", e);
      if (e instanceof Error && e.name === 'QuotaExceededError') {
        showToast("Storage quota exceeded! Some standards could not be saved.", "error");
      } else {
        showToast("An error occurred while saving standards.", "error");
      }
    }
  }, [standards]);
  const [standardTypes, setStandardTypes] = useState<string[]>(['Main', 'Placeholder', 'Metal', 'Stone', 'Scene', 'Model', 'Set', 'Video', 'VI', 'AD', 'Component']);
  const [activeStandardType, setActiveStandardType] = useState<string>('Main');
  const [isAddingStandardType, setIsAddingStandardType] = useState(false);
  const [newStandardTypeName, setNewStandardTypeName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [creationStep, setCreationStep] = useState(1);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [libraryTarget, setLibraryTarget] = useState<'mainItem' | 'matchingItem' | null>(null);
  const [newProjectData, setNewProjectData] = useState({
    sku: '',
    workflow: 'Main' as WorkflowType,
    category: 'Ring' as Standard['category'],
    material: '14k Gold',
    weight: '',
    size: '',
    notes: '',
    matchingSkus: '',
    standardId: '',
    placeholderId: '',
    metalId: 'std-metal-14k-gold',
    mainItem: '',
    matchingItem: '',
    detailTypes: [] as string[],
    threeViewSources: [] as string[], // Support multiple source images
    threeViews: {
      front: '',
      side: '',
      back: ''
    }
  });
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const socketRef = React.useRef<any>(null);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [agentMessages, setAgentMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
    { role: 'assistant', content: 'Hello! I am your Jewelry AI Agent. I can help you generate images, videos, and manage your workstation. Try saying "Generate a silver ring main image for SKU123".' }
  ]);
  const [agentInput, setAgentInput] = useState('');
  const [isAgentThinking, setIsAgentThinking] = useState(false);

  // --- Socket.io Connection ---
  useEffect(() => {
    const socket = io(window.location.origin);
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to Agent Relay Server");
    });

    socket.on("agent:command", async (data: { command: string, params: any }) => {
      console.log("Received Agent Command:", data);
      handleAgentCommand(data.command, data.params);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleAgentCommand = async (command: string, params: any) => {
    showToast(`Agent executing: ${command}`, "info");
    
    switch (command) {
      case 'generate_main_image':
        if (params.sku) {
          setActiveWorkflow('MainImage');
          setMainImageData(prev => ({ 
            ...prev, 
            sku: params.sku, 
            targetMetal: params.metalId || prev.targetMetal,
            category: params.category || prev.category
          }));
          // Trigger generation after a short delay to allow state to settle
          setTimeout(() => {
            const btn = document.getElementById('generate-main-btn');
            if (btn) btn.click();
          }, 500);
        }
        break;
      case 'switch_workflow':
        if (params.workflow) {
          setActiveWorkflow(params.workflow);
        }
        break;
      case 'show_toast':
        showToast(params.message, params.type || 'info');
        break;
      default:
        console.warn("Unknown agent command:", command);
    }
  };

  const handleAgentChat = async () => {
    if (!agentInput.trim()) return;
    
    const userMsg = agentInput;
    setAgentMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setAgentInput('');
    setIsAgentThinking(true);

    try {
      const apiKey = customApiKey || process.env.API_KEY;
      if (!apiKey) throw new Error("API Key required");

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          { role: 'user', parts: [{ text: `You are a Jewelry AI Workstation Assistant. 
            You can help the user by generating images and controlling the UI.
            
            AVAILABLE TOOLS:
            - generate_main_image(sku: string, metalId?: string, category?: string)
            - switch_workflow(workflow: "MainImage" | "DetailAssets" | "VideoAssets" | "Library" | "Standards")
            - show_toast(message: string, type: "success" | "error" | "info")
            
            USER REQUEST: ${userMsg}
            
            If the user wants to generate something, call the appropriate tool by outputting a JSON block like:
            {"tool": "generate_main_image", "params": {"sku": "SKU123"}}
            
            Otherwise, respond naturally.` }] }
        ]
      });

      const text = response.text;
      try {
        const toolMatch = text.match(/\{"tool":.*?\}/);
        if (toolMatch) {
          const toolData = JSON.parse(toolMatch[0]);
          handleAgentCommand(toolData.tool, toolData.params);
          setAgentMessages(prev => [...prev, { role: 'assistant', content: `Executing ${toolData.tool}...` }]);
        } else {
          setAgentMessages(prev => [...prev, { role: 'assistant', content: text }]);
        }
      } catch (e) {
        setAgentMessages(prev => [...prev, { role: 'assistant', content: text }]);
      }
    } catch (error) {
      showToast("Agent error: " + (error as Error).message, "error");
    } finally {
      setIsAgentThinking(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  // --- Initialize API Key State ---
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (hasKey) {
          setHasApiKey(true);
          setIsCheckingKey(false);
          return;
        }
      }
      // Fallback to custom key or env
      if (customApiKey || process.env.API_KEY) {
        setHasApiKey(true);
      } else {
        setHasApiKey(false);
      }
      setIsCheckingKey(false);
    };
    checkKey();
  }, [customApiKey]);

  const handleConnectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(hasKey);
    } else {
      setIsSettingKey(true);
      setTempApiKey(customApiKey);
    }
  };

  const saveCustomKey = () => {
    setCustomApiKey(tempApiKey);
    localStorage.setItem('gemini-custom-api-key', tempApiKey);
    setIsSettingKey(false);
    showToast("API Key saved locally.", "success");
  };

  const exportStandards = () => {
    const dataStr = JSON.stringify(standards, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `jewelry-ai-standards-${new Date().toISOString().split('T')[0]}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const importStandards = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const imported = JSON.parse(content);
        
        // Case 1: Standard Array (Full Backup format like the one provided)
        if (Array.isArray(imported)) {
          setStandards(prev => {
            const merged = [...prev];
            imported.forEach((impStd: any) => {
              const id = impStd.id || `std-imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              
              // Ensure required fields exist and match our interface
              const sanitizedStd = {
                ...impStd,
                id,
                name: impStd.name || 'Imported Standard',
                type: impStd.type || 'Main',
                category: impStd.category || 'All',
                metal: impStd.metal || 'All',
                stone: impStd.stone || 'All',
                rules: impStd.rules || { composition: 'Standard', lighting: 'Studio', size: '2000x2000' }
              };
              
              const index = merged.findIndex(s => s.id === id);
              if (index !== -1) merged[index] = sanitizedStd;
              else merged.push(sanitizedStd);
            });
            return merged;
          });
          showToast(`Successfully imported ${imported.length} standards!`, "success");
          return;
        }

        // Case 2: Stone Library (ChatGPT Object Format)
        if (imported && (imported.stone_standards || imported.shared_base_rules || imported.stones || imported.stone_library)) {
          const stoneLibraryData = {
            sharedBaseRules: imported.shared_base_rules,
            negativePrompt: imported.negative_prompt,
            colorAdjustments: imported.stone_color_adjustment,
            cutAdjustments: imported.stone_cut_adjustment,
            categoryAdjustments: imported.product_category_adjustment,
          };

          let stoneList: any[] = [];
          if (Array.isArray(imported.stone_standards)) stoneList = imported.stone_standards;
          else if (imported.stone_standards) stoneList = Object.entries(imported.stone_standards).map(([name, d]: [string, any]) => ({ name, ...(typeof d === 'object' ? d : { prompt: d }) }));
          else if (Array.isArray(imported.stones)) stoneList = imported.stones;
          else if (imported.stones) stoneList = Object.entries(imported.stones).map(([name, d]: [string, any]) => ({ name, ...(typeof d === 'object' ? d : { prompt: d }) }));
          else if (Array.isArray(imported.stone_library)) stoneList = imported.stone_library;
          else if (imported.stone_library) stoneList = Object.entries(imported.stone_library).map(([name, d]: [string, any]) => ({ name, ...(typeof d === 'object' ? d : { prompt: d }) }));
          else {
            // Fallback: look for top-level keys that look like stones (have a prompt or are strings)
            const excludedKeys = [
              'shared_base_rules', 'negative_prompt', 'render_notes', 
              'stone_color_adjustment', 'stone_cut_adjustment', 'product_category_adjustment',
              'stone_standards', 'stones', 'stone_library'
            ];
            stoneList = Object.entries(imported)
              .filter(([key, value]) => !excludedKeys.includes(key) && (
                (typeof value === 'object' && (value as any).prompt) || 
                (typeof value === 'string' && value.length > 20)
              ))
              .map(([name, data]: [string, any]) => ({
                name,
                ...(typeof data === 'object' ? data : { prompt: data })
              }));
          }

          if (stoneList.length === 0) {
            showToast("Imported file has no stone standards.", "info");
            return;
          }

          const newStandards: Standard[] = stoneList.map((s: any, idx: number) => ({
            id: `std-stone-${Date.now()}-${idx}`,
            name: s.name || 'Stone Standard',
            type: 'Stone',
            category: 'All',
            metal: 'All',
            stone: 'All',
            prompt: s.prompt || '',
            rules: { composition: 'Standard', lighting: 'Studio', size: '2000x2000' },
            stoneLibraryData
          }));

          setStandards(prev => {
            const merged = [...prev];
            newStandards.forEach(ns => {
              const index = merged.findIndex(s => s.name === ns.name && s.type === 'Stone');
              if (index !== -1) merged[index] = ns;
              else merged.push(ns);
            });
            return merged;
          });
          showToast(`Successfully imported ${stoneList.length} stone standards!`, "success");
        } else {
          showToast("Failed to import standards. Unknown file format.", "error");
        }
      } catch (err) {
        showToast("Failed to import standards. Invalid file format.", "error");
      }
    };
    reader.readAsText(file);
  };

  const resetStandards = () => {
    if (window.confirm("Are you sure you want to reset all standards to defaults? Your custom changes will be lost unless you've exported them.")) {
      setStandards(INITIAL_STANDARDS);
      localStorage.removeItem('jewelry-ai-standards-v2');
      localStorage.removeItem('jewelry-ai-standards');
    }
  };

  // --- AI Generation Logic ---
  const generateWithGemini = async (prompt: string, referenceImages: (string | undefined)[] = []) => {
    console.log("Starting Gemini Generation with prompt:", prompt);
    try {
      const apiKey = customApiKey || process.env.API_KEY;
      if (!apiKey) {
        showToast("API Key not found. Please connect your paid key.", "error");
        return null;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const processImage = async (img: string): Promise<string | null> => {
        if (img.startsWith('data:')) return img;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(img, { signal: controller.signal });
          clearTimeout(timeoutId);
          const blob = await response.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.error("Failed to fetch reference image:", img, e);
          return null;
        }
      };

      const processedImages = await Promise.all(referenceImages.filter(Boolean).map(img => processImage(img!)));
      const validImages = processedImages.filter(img => img && img.startsWith('data:image')).slice(0, 5);

      console.log(`Sending ${validImages.length} images to Gemini`);

      const modelPromise = ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [
            { text: `TASK: Generate a hyper-realistic jewelry product image.
              
              PROMPT: ${prompt}
              
              CRITICAL CONSTRAINTS:
              1. GEOMETRY: The jewelry's shape MUST exactly match the 3D drawings provided.
              2. LIGHTING: Professional studio lighting with realistic reflections.
              3. BACKGROUND: Clean, high-end product photography background.
              4. ONLY the jewelry item should be visible.
              5. Return ONLY the image data.` },
            ...validImages.map(img => ({
              inlineData: {
                data: img!.split(',')[1],
                mimeType: 'image/png'
              }
            }))
          ]
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K"
          }
        }
      });

      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("AI generation timed out after 90 seconds")), 90000)
      );

      const response = await Promise.race([modelPromise, timeoutPromise]);
      
      if (!response.candidates?.[0]?.content?.parts) {
        throw new Error("No response parts from AI model");
      }

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          console.log("Successfully generated image data");
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      
      const textPart = response.candidates[0].content.parts.find(p => p.text);
      if (textPart) {
        console.warn("AI returned text instead of image:", textPart.text);
        throw new Error(`AI Refusal: ${textPart.text}`);
      }

      throw new Error("No image data returned from AI");
    } catch (error: any) {
      console.error("Gemini Generation Error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes("API_KEY_INVALID") || errorMessage.includes("key not found") || errorMessage.includes("entity was not found")) {
        showToast("Invalid API Key. Please reconnect.", "error");
        setHasApiKey(false);
      } else if (errorMessage.includes("quota")) {
        showToast("API Quota exceeded. Please try again later.", "error");
      } else {
        showToast(`Generation failed: ${errorMessage}`, "error");
      }
      return null;
    }
  };

  const [isCreatingStandard, setIsCreatingStandard] = useState(false);
  const [isImportingStandard, setIsImportingStandard] = useState(false);
  const [refiningStandardId, setRefiningStandardId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzingStandard, setIsAnalyzingStandard] = useState(false);
  const [editingStandard, setEditingStandard] = useState<Standard | null>(null);
  const [modalType, setModalType] = useState<string>('Main');

  useEffect(() => {
    if (editingStandard) {
      setModalType(editingStandard.type);
    } else if (isCreatingStandard) {
      setModalType(activeStandardType);
    }
  }, [editingStandard, isCreatingStandard, activeStandardType]);

  // --- Standard Matching Logic ---
  const findBestStandard = (type: Standard['type'], category: string, metal: string, stone: string = 'All') => {
    // 1. Try exact match for category and metal
    const exactMatch = standards.find(s => 
      s.type === type && 
      s.category === category &&
      (s.metal === metal || s.metal === 'All') &&
      (s.stone === stone || s.stone === 'All')
    );
    if (exactMatch) return exactMatch;

    // 2. Try match for category only
    const categoryMatch = standards.find(s => 
      s.type === type && 
      s.category === category &&
      s.metal === 'All'
    );
    if (categoryMatch) return categoryMatch;

    // 3. Handle specific necklace types if generic "Necklace" is provided
    if (category === 'necklace') {
      const pendantMatch = standards.find(s => s.type === type && s.category === 'necklace with pendant');
      const chainMatch = standards.find(s => s.type === type && s.category === 'necklace');
      if (pendantMatch) return pendantMatch;
      if (chainMatch) return chainMatch;
    }

    // 4. Try match for metal only
    const metalMatch = standards.find(s => 
      s.type === type && 
      s.category === 'All' &&
      s.metal === metal
    );
    if (metalMatch) return metalMatch;

    // 5. Fallback to generic for type
    return standards.find(s => s.type === type && s.category === 'All') || standards.find(s => s.type === type);
  };

  const handleImportStandard = async (base64Image: string) => {
    setIsAnalyzingStandard(true);
    try {
      const existingStandard = refiningStandardId ? standards.find(s => s.id === refiningStandardId) : null;
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const prompt = existingStandard 
        ? `Analyze this jewelry reference image. 
           The existing standard "${existingStandard.name}" has this prompt: "${existingStandard.prompt}".
           Your goal is to REFINE and ENHANCE the existing prompt based on this new reference image. 
           Do not completely replace it; instead, incorporate new details about lighting, texture, or composition found in this image.
           Maintain the core style but make it more comprehensive.
           Return ONLY valid JSON with the updated fields.`
        : `Analyze this jewelry reference image. Your goal is to create a 'Standard' for AI image generation. 
           Extract: 
           - Name: Descriptive name.
           - Type: One of: ${standardTypes.join(', ')}.
           - Category: Ring, necklace, necklace with pendant, charms & pendants, earrings, bracelet, hand chain, or All. 
             *Note: 'necklace' is chain only or chain + pendant. 'necklace with pendant' is drop-style. 'charms & pendants' is no chain.*
           - Metal: Silver, Gold Vermeil, 14k Gold, or All.
           - Stone: Diamond, Sapphire, Ruby, Emerald, or All.
           - Prompt: Detailed prompt capturing style, materials, and atmosphere.
           - Rules: Composition and Lighting details.
           - If it's a 'VI' standard, extract 'primaryColor' (hex), 'secondaryColor' (hex), and 'fontFamily'.
           - If it's an 'AD' standard, extract 'businessName', 'headlines' (array of strings), and 'callToAction'.
           - If it's a 'Main' or 'Scene' standard, suggest a 'backgroundColor' (hex). Return ONLY valid JSON.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: base64Image.split(',')[1],
                  mimeType: 'image/png'
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING, enum: standardTypes },
              category: { type: Type.STRING, enum: ["Ring", "necklace", "necklace with pendant", "charms & pendants", "earrings", "bracelet", "hand chain", "All"] },
              subCategory: { type: Type.STRING },
              metal: { type: Type.STRING, enum: ["Silver", "Gold Vermeil", "14k Gold", "All"] },
              stone: { type: Type.STRING, enum: ["Diamond", "Sapphire", "Ruby", "Emerald", "All"] },
              prompt: { type: Type.STRING },
              backgroundColor: { type: Type.STRING },
              primaryColor: { type: Type.STRING },
              secondaryColor: { type: Type.STRING },
              fontFamily: { type: Type.STRING },
              businessName: { type: Type.STRING },
              headlines: { type: Type.ARRAY, items: { type: Type.STRING } },
              callToAction: { type: Type.STRING },
              rules: {
                type: Type.OBJECT,
                properties: {
                  composition: { type: Type.STRING },
                  lighting: { type: Type.STRING }
                }
              }
            }
          }
        }
      });

      let text = response.text;
      // Extract JSON if it's wrapped in markdown code blocks
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```([\s\S]*?)```/);
      if (jsonMatch) {
        text = jsonMatch[1];
      }
      
      const data = JSON.parse(text.trim());
      if (data) {
        if (existingStandard) {
          const updatedImages = [...(existingStandard.referenceImages || [existingStandard.referenceImage].filter(Boolean) as string[]), base64Image];
          setStandards(prev => prev.map(s => s.id === refiningStandardId ? {
            ...s,
            name: data.name || s.name,
            type: data.type || s.type,
            category: data.category || s.category,
            subCategory: data.subCategory || s.subCategory,
            metal: data.metal || s.metal,
            stone: data.stone || s.stone,
            prompt: data.prompt || s.prompt,
            backgroundColor: data.backgroundColor || s.backgroundColor,
            rules: {
              ...s.rules,
              composition: data.rules?.composition || s.rules.composition,
              lighting: data.rules?.lighting || s.rules.lighting
            },
            referenceImages: updatedImages,
            referenceImage: base64Image
          } : s));
        } else {
          const newStandard: Standard = {
            id: `std-${Date.now()}`,
            name: data.name || 'AI Imported Standard',
            type: data.type || activeStandardType,
            category: data.category || 'All',
            subCategory: data.subCategory || '',
            metal: data.metal || 'All',
            stone: data.stone || 'All',
            prompt: data.prompt || '',
            backgroundColor: data.backgroundColor || '#FAFAFA',
            primaryColor: data.primaryColor,
            secondaryColor: data.secondaryColor,
            fontFamily: data.fontFamily,
            businessName: data.businessName,
            headlines: data.headlines,
            callToAction: data.callToAction,
            referenceImage: base64Image,
            referenceImages: [base64Image],
            rules: {
              composition: data.rules?.composition || 'Standard',
              lighting: data.rules?.lighting || 'Studio',
              size: '2000x2000'
            }
          };
          setStandards(prev => [...prev, newStandard]);
          // Switch to the type of the imported standard so the user sees it
          if (data.type && standardTypes.includes(data.type)) {
            setActiveStandardType(data.type);
          }
        }
        setIsImportingStandard(false);
        setRefiningStandardId(null);
      }
    } catch (error) {
      console.error("Standard Analysis Error:", error);
    } finally {
      setIsAnalyzingStandard(false);
    }
  };

  const analyzeThreeViewImage = async (base64Image: string): Promise<AnalysisData | null> => {
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [
          {
            parts: [
              { text: `Analyze these jewelry CAD drawings (Multi-View). Your goal is to extract technical specifications with high precision for rendering.
              Look for Chinese text like '蛋石' (Main Stone), '圆石' (Side Stones), 'S925' (Material), and weight in 'g'. 
              Example: '6X8MM*1' means one 6x8mm stone. 
              CRITICAL: Extract the physical dimensions (Size) and Weight accurately. These will be used to render the item at the correct scale on models and in scenes.
              Extract: 
              - SKU: The product identifier.
              - Category: Ring, necklace, necklace with pendant, charms & pendants, earrings, bracelet, or hand chain.
                *Identification: Rings are circular bands. necklace is base chain only or chain + pendant. charms & pendants is no chain.*
              - Material: Metal type (e.g., S925, 18K Gold).
              - Weight: Weight in grams (e.g., 2.5g).
              - Size: Dimensions in mm (e.g., 12mm x 15mm).
              - Notes: Detailed notes including stone types, sizes, and quantities.
              Return ONLY valid JSON.` },
              {
                inlineData: {
                  data: base64Image.split(',')[1],
                  mimeType: 'image/png'
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sku: { type: Type.STRING },
              category: { type: Type.STRING, enum: ["Ring", "necklace", "necklace with pendant", "charms & pendants", "earrings", "bracelet", "hand chain"] },
              material: { type: Type.STRING },
              weight: { type: Type.STRING },
              size: { type: Type.STRING },
              notes: { type: Type.STRING }
            }
          }
        }
      });

      let text = response.text;
      // Extract JSON if it's wrapped in markdown code blocks
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```([\s\S]*?)```/);
      if (jsonMatch) {
        text = jsonMatch[1];
      }
      
      const data = JSON.parse(text.trim());
      if (data) {
        setNewProjectData(prev => ({
          ...prev,
          sku: data.sku || prev.sku,
          category: data.category || prev.category,
          material: data.material || prev.material,
          weight: data.weight || prev.weight,
          size: data.size || prev.size,
          notes: data.notes || prev.notes
        }));
        return data;
      }
    } catch (error) {
      console.error("Image Analysis Error:", error);
    } finally {
      setIsAnalyzing(false);
    }
    return null;
  };

  const handleMainImageGenerate = async () => {
    if (!mainImageData.fourViewSource) {
      showToast("Please upload a 3D Multi-View drawing first.", "error");
      return;
    }

    setMainImageData(prev => ({ ...prev, status: 'generating' }));
    
    try {
      const metalStandard = standards.find(s => s.id === mainImageData.targetMetal);
      const placeholderStandard = standards.find(s => s.id === mainImageData.placeholderId);
      const mainStandard = standards.find(s => s.id === mainImageData.standardId);
      const stoneStandard = standards.find(s => s.id === mainImageData.stoneId);
      
      if (mainImageData.placeholderId === 'custom' && !mainImageData.customPlaceholderSource) {
        throw new Error("Please upload a custom reference image (垫图) or select a preset.");
      }

      if (mainImageData.placeholderId !== 'custom' && !placeholderStandard) {
        throw new Error("Please select a Placeholder standard.");
      }

      if (!mainStandard) {
        throw new Error("Please select a Main Style standard.");
      }

      const category = placeholderStandard?.category || 'All';
      const bgColor = mainStandard.backgroundColor || '#FFFFFF';

      // Helper to fetch and convert image to base64
      const getBase64 = async (url: string): Promise<string | null> => {
        if (url.startsWith('data:')) return url.split(',')[1];
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result as string;
              resolve(base64.split(',')[1]);
            };
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.error("Failed to fetch image for AI:", url);
          return null;
        }
      };

      // Build Stone Instructions
      let stoneInstructions = "";
      if (mainImageData.mainStone) {
        stoneInstructions += `MAIN STONE: ${mainImageData.mainStone} (${mainImageData.mainStoneColor || 'Clear'}). `;
      }
      if (mainImageData.sideStone) {
        stoneInstructions += `SIDE STONE: ${mainImageData.sideStone} (${mainImageData.sideStoneColor || 'Clear'}). `;
      }

      let stonePrompt = stoneStandard?.prompt || '';
      let negativePrompt = "";
      
      if (stoneStandard?.stoneLibraryData) {
        const lib = stoneStandard.stoneLibraryData;
        const colorAdj = lib.colorAdjustments?.[mainImageData.mainStoneColor] || '';
        const cutAdj = lib.cutAdjustments?.[mainImageData.stoneCut] || '';
        const catAdj = lib.categoryAdjustments?.[category] || '';
        
        stonePrompt = `
          ${lib.sharedBaseRules || ''}
          ${stonePrompt}
          ${colorAdj}
          ${cutAdj}
          ${catAdj}
        `.trim();

        negativePrompt = lib.negativePrompt || "";
      }

      if (!stoneInstructions && !stonePrompt) {
        stoneInstructions = "STONES: All stones MUST be Clear White Zircon (Cubic Zirconia). They must be perfectly transparent and colorless with no blue tints.";
      }

      // Combine Prompts from Standards
      const prompt = `
        TASK: Generate a professional commercial jewelry product image.
        
        INPUT IMAGES ROLES:
        - IMAGE_0 (3D_CAD): The ABSOLUTE reference for the jewelry's geometry and intricate details.
        - IMAGE_1 (PLACEHOLDER_REF): The MANDATORY reference for perspective, angle, and composition.
        - IMAGE_2 (METAL_REF): The reference for metal texture and reflections.
        - IMAGE_3 (STONE_REF): The reference for stone material, fire, and sparkle.
        
        STRICT REQUIREMENTS:
        1. GEOMETRY: The product's shape must be a perfect 3D-to-Photo translation of IMAGE_0.
        2. COMPOSITION: You MUST match the EXACT angle, placement, and perspective of the jewelry item shown in IMAGE_1. This is the "underlay" (垫图) for the final rendering.
        3. CHAIN: If IMAGE_0 has no chain, render exactly ONE single continuous jewelry chain that passes through the bail in IMAGE_0. The chain style MUST match IMAGE_1.
        4. MATERIAL: ${metalStandard?.prompt || 'High-polish metal.'}
        5. STONES: ${stoneInstructions} ${stonePrompt}
        6. LIGHTING: Follow the style of ${mainStandard.name}. ${mainStandard.prompt || ''}
        7. BACKGROUND: Solid ${bgColor}.
        ${negativePrompt ? `NEGATIVE_PROMPT: ${negativePrompt}` : ''}
      `;

      // Prepare parts with labels
      const parts: any[] = [
        { text: prompt },
        { inlineData: { data: mainImageData.fourViewSource.split(',')[1], mimeType: 'image/png' } } // IMAGE_0
      ];

      // Process and add reference images
      let placeholderB64 = null;
      if (mainImageData.placeholderId === 'custom') {
        placeholderB64 = mainImageData.customPlaceholderSource.split(',')[1];
      } else if (placeholderStandard?.referenceImage) {
        placeholderB64 = await getBase64(placeholderStandard.referenceImage);
      }

      if (placeholderB64) {
        parts.push({ inlineData: { data: placeholderB64, mimeType: 'image/png' } }); // IMAGE_1
      } else {
        console.warn("No placeholder image provided to AI.");
      }

      const metalB64 = metalStandard?.referenceImage ? await getBase64(metalStandard.referenceImage) : null;
      if (metalB64) {
        parts.push({ inlineData: { data: metalB64, mimeType: 'image/png' } }); // IMAGE_2
      }

      const stoneB64 = stoneStandard?.referenceImage ? await getBase64(stoneStandard.referenceImage) : null;
      if (stoneB64) {
        parts.push({ inlineData: { data: stoneB64, mimeType: 'image/png' } }); // IMAGE_3
      }

      // Use Gemini 3.1 Flash Image
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K"
          }
        }
      });

      let resultUrl = "";
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          resultUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
      
      if (resultUrl) {
        setMainImageData(prev => ({ ...prev, generatedUrl: resultUrl, status: 'completed' }));
        
        // Add to registry automatically
        const newEntry: ProductRegistryEntry = {
          sku: mainImageData.sku || `SKU-${Date.now()}`,
          category: category,
          specs: {
            material: 'Standard',
            weight: '',
            size: '',
            notes: 'Generated via Gemini 3.1 Flash Image'
          },
          mainImages: [{ url: resultUrl, metal: metalStandard?.name || 'Standard' }],
          lastUpdated: new Date().toISOString()
        };
        
        setProductRegistry(prev => {
          const skuToUse = mainImageData.sku || newEntry.sku;
          const existingIdx = prev.findIndex(item => item.sku === skuToUse);
          if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx] = { ...newEntry, sku: skuToUse };
            return updated;
          }
          return [...prev, newEntry];
        });
        
        showToast("Main Image generated and saved to library!", "success");
      } else {
        setMainImageData(prev => ({ ...prev, status: 'failed' }));
      }
    } catch (error) {
      console.error("Main Image Generation Error:", error);
      setMainImageData(prev => ({ ...prev, status: 'failed' }));
      showToast("Failed to generate main image.", "error");
    }
  };

  const handleDetailAssetsGenerate = async () => {
    if (!detailAssetsData.mainItemSku) {
      showToast("Please select a main item from the library.", "error");
      return;
    }

    setDetailAssetsData(prev => ({ ...prev, status: 'generating' }));
    
    try {
      const mainItem = productRegistry.find(item => item.sku === detailAssetsData.mainItemSku);
      const matchingItem = detailAssetsData.matchingItemSku ? productRegistry.find(item => item.sku === detailAssetsData.matchingItemSku) : null;
      
      if (!mainItem) throw new Error("Main item not found in library.");

      const sceneStandard = detailAssetsData.sceneStandardId 
        ? standards.find(s => s.id === detailAssetsData.sceneStandardId) 
        : findBestStandard('Scene', mainItem.category, mainItem.specs.material);
      
      const modelStandard = detailAssetsData.modelStandardId 
        ? standards.find(s => s.id === detailAssetsData.modelStandardId) 
        : findBestStandard('Model', mainItem.category, mainItem.specs.material);

      // Necklace Chain Logic for Detail Assets
      let chainInstruction = "";
      if (mainItem.category === 'necklace' || mainItem.category === 'necklace with pendant') {
        const chainComp = standards.find(s => s.type === 'Component' && s.name.toLowerCase().includes('chain'));
        chainInstruction = `
          IMPORTANT: This is a NECKLACE. The input 3D drawing may not show the chain, but you MUST render a high-quality jewelry chain.
          CHAIN STYLE: ${chainComp?.prompt || 'Standard fine link jewelry chain, matching the metal texture.'}
        `;
      } else if (mainItem.category === 'charms & pendants') {
        chainInstruction = "IMPORTANT: This is a PENDANT ONLY. Do NOT render any chain or necklace. Focus only on the charm/pendant itself.";
      }

      const assetTypes = [
        { id: 'mainScene', label: 'Main Item Scene', prompt: `High-end lifestyle product scene for ${mainItem.sku}. ${sceneStandard?.prompt || 'Elegant background, soft lighting.'} ${chainInstruction}` },
        { id: 'setScene', label: 'Set/Stack Scene', prompt: `Jewelry set/stacking scene featuring ${mainItem.sku} ${matchingItem ? 'and ' + matchingItem.sku : ''}. ${sceneStandard?.prompt || 'Harmonious composition.'} ${chainInstruction}` },
        { id: 'mainModel', label: 'Model Wear (Focus)', prompt: `Professional model wearing ${mainItem.sku}. ${modelStandard?.prompt || 'Close-up shot focusing on the jewelry details and fit.'} ${chainInstruction}` },
        { id: 'setModel', label: 'Set Model Wear', prompt: `Model wearing the complete set: ${mainItem.sku} ${matchingItem ? 'and ' + matchingItem.sku : ''}. ${modelStandard?.prompt || 'Lifestyle fashion shot.'} ${chainInstruction}` }
      ];

      const results: any = {};
      
      // We process these sequentially to avoid overwhelming the API and for better status tracking
      for (const asset of assetTypes) {
        // Skip set assets if no matching item
        if ((asset.id === 'setScene' || asset.id === 'setModel') && !matchingItem) continue;

        const prompt = `
          TASK: Generate a high-end marketing asset.
          TYPE: ${asset.label}
          DESCRIPTION: ${asset.prompt}
          REFERENCE: Use the provided main product image for visual consistency of the jewelry.
          SIZE CONTROL: ${detailAssetsData.sizeRefSource ? 'CRITICAL: Use the provided 3D drawing to ensure correct physical scale and proportions relative to the scene/model.' : 'Maintain realistic jewelry proportions.'}
          STYLE: Luxury jewelry marketing photography, high-end aesthetic, professional lighting.
        `;

        const refs = [mainItem.mainImages?.[0]?.url, matchingItem?.mainImages?.[0]?.url, detailAssetsData.sizeRefSource].filter(Boolean) as string[];
        const result = await generateWithGemini(prompt, refs);
        if (result) results[asset.id] = result;
      }

      setDetailAssetsData(prev => ({ ...prev, results: { ...prev.results, ...results }, status: 'completed' }));
      showToast("Detail assets generated successfully!", "success");
    } catch (error) {
      console.error("Detail Assets Generation Error:", error);
      setDetailAssetsData(prev => ({ ...prev, status: 'failed' }));
      showToast("Failed to generate detail assets.", "error");
    }
  };

  const handleVideoGenerate = async () => {
    if (!videoAssetsData.mainItemSku) {
      showToast("Please select a main item from the library.", "error");
      return;
    }

    setVideoAssetsData(prev => ({ ...prev, status: 'generating', generatedUrl: '', currentStep: 'Initializing...' }));
    
    try {
      const mainItem = productRegistry.find(item => item.sku === videoAssetsData.mainItemSku);
      const videoType = VIDEO_TYPES.find(t => t.id === videoAssetsData.videoTypeId);
      
      if (!mainItem || !videoType) throw new Error("Missing data for video generation.");

      const videoStandard = videoAssetsData.standardId 
        ? standards.find(s => s.id === videoAssetsData.standardId) 
        : findBestStandard('Video', mainItem.category, mainItem.specs.material);

      // Necklace Chain Logic for Video Assets
      let chainInstruction = "";
      if (mainItem.category === 'necklace' || mainItem.category === 'necklace with pendant') {
        const chainComp = standards.find(s => s.type === 'Component' && s.name.toLowerCase().includes('chain'));
        chainInstruction = `
          IMPORTANT: This is a NECKLACE. The input 3D drawing may not show the chain, but you MUST render a high-quality jewelry chain.
          CHAIN STYLE: ${chainComp?.prompt || 'Standard fine link jewelry chain, matching the metal texture.'}
        `;
      } else if (mainItem.category === 'charms & pendants') {
        chainInstruction = "IMPORTANT: This is a PENDANT ONLY. Do NOT render any chain or necklace. Focus only on the charm/pendant itself.";
      }

      const prompt = `
        TASK: Generate a high-end cinematic jewelry video.
        TYPE: ${videoType.name}
        PRODUCT: ${mainItem.sku}
        STYLE: ${videoType.prompt}
        STANDARD: ${videoStandard?.prompt || 'Luxury, elegant, professional lighting, smooth camera movement.'}
        REFERENCE: Use the provided main product image for visual consistency.
        ${chainInstruction}
      `;
      
      console.log("Video Generation Prompt:", prompt);

      // Simulated steps for better UX
      const steps = [
        "Analyzing product geometry...",
        "Setting up cinematic lighting...",
        "Rendering physics-based motion...",
        "Finalizing 4K output..."
      ];

      for (const step of steps) {
        setVideoAssetsData(prev => ({ ...prev, currentStep: step }));
        console.log(`Step: ${step}`);
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
      
      setVideoAssetsData(prev => ({ 
        ...prev, 
        generatedUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', 
        status: 'completed',
        currentStep: 'Generation Complete'
      }));
      
      showToast("Video asset generated successfully!", "success");
    } catch (error) {
      console.error("Video Generation Error:", error);
      setVideoAssetsData(prev => ({ ...prev, status: 'failed', currentStep: 'Error' }));
      showToast("Failed to generate video.", "error");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newSources: string[] = [];
    const newFileNames: string[] = [];
    let processed = 0;

    (Array.from(files) as File[]).forEach(file => {
      const reader = new FileReader();
      const fileName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension for SKU
      reader.onloadend = () => {
        const base64 = reader.result as string;
        newSources.push(base64);
        newFileNames.push(fileName);
        processed++;
        
        if (processed === files.length) {
          setNewProjectData(prev => ({ 
            ...prev, 
            sku: prev.workflow === 'Main' 
              ? (prev.sku ? prev.sku + '\n' : '') + newFileNames.join('\n')
              : prev.sku || newFileNames[0],
            threeViewSources: [...prev.threeViewSources, ...newSources] 
          }));
          // Analyze the first one for specs if it's not a batch Main workflow
          if (newProjectData.workflow !== 'Main' && newProjectData.threeViewSources.length === 0) {
            analyzeThreeViewImage(newSources[0]);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // --- Handlers ---
  const addStandard = (std: Standard) => {
    setStandards(prev => [...prev, std]);
    setIsCreatingStandard(false);
    setEditingStandard(null);
  };

  const deleteStandard = (id: string) => {
    setStandards(prev => prev.filter(s => s.id !== id));
  };

  const deleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  const updateStandard = (std: Standard) => {
    setStandards(prev => prev.map(s => s.id === std.id ? std : s));
    setEditingStandard(null);
    setIsCreatingStandard(false);
  };

  const createProject = () => {
    const { 
      sku: skuInput, 
      workflow, 
      category, 
      material, 
      weight, 
      size, 
      notes, 
      matchingSkus: matchingStr, 
      standardId, 
      placeholderId, 
      metalId, 
      mainItem,
      matchingItem,
      detailTypes,
      threeViews, 
      threeViewSources 
    } = newProjectData;
    
    const matchingSkus = matchingStr.split(',').map(s => s.trim()).filter(s => s !== '');
    
    const skus = workflow === 'Main' 
      ? skuInput.split('\n').map(s => s.trim()).filter(s => s)
      : [skuInput.trim() || `SKU-${Math.random().toString(36).substr(2, 5).toUpperCase()}`];

    const newProjects: SKUProject[] = skus.map((sku, index) => {
      // Auto-match standards if not manually selected
      const matchedMain = standardId ? standards.find(s => s.id === standardId) : findBestStandard('Main', category, material);
      const matchedPlaceholder = placeholderId ? standards.find(s => s.id === placeholderId) : findBestStandard('Placeholder', category, material);
      const matchedMetal = metalId ? standards.find(s => s.id === metalId) : findBestStandard('Metal', 'All', material);

      // Determine which source images to use
      // If Main workflow and number of SKUs matches number of images, distribute them 1-to-1
      // Otherwise (e.g. 1 SKU with 4 images), use all images for the project
      let projectSources = threeViewSources;
      if (workflow === 'Main' && skus.length === threeViewSources.length) {
        projectSources = [threeViewSources[index]];
      }

      const project: SKUProject = {
        id: Math.random().toString(36).substr(2, 9),
        sku,
        workflow,
        category,
        specs: { 
          material: workflow === 'Main' ? (matchedMetal?.metal || material) : material, 
          weight, 
          size, 
          notes 
        },
        threeViewSources: projectSources,
        threeViews,
        status: 'input',
        derivedAssets: [],
        matchingSkus,
        standardId: matchedMain?.id || standards[0].id,
        placeholderId: matchedPlaceholder?.id,
        metalId: workflow === 'Main' ? (metalId || matchedMetal?.id) : undefined,
        mainItem: workflow === 'Detail' ? mainItem : undefined,
        matchingItem: workflow === 'Detail' ? matchingItem : undefined,
        detailTypes: workflow === 'Detail' ? detailTypes : undefined,
      };

      // Initialize derived assets based on workflow
      if (workflow === 'Main') {
        const std = standards.find(s => s.id === metalId);
        project.mainImages = [{ metal: std?.name || 'Unknown', url: '' }];
        project.derivedAssets = [
          { type: 'Model Wear', url: '', status: 'pending' },
          { type: 'Lifestyle Scene', url: '', status: 'pending' },
          { type: 'Macro Detail', url: '', status: 'pending' }
        ];
      } else if (workflow === 'Detail') {
        project.derivedAssets = detailTypes.map(type => ({
          type,
          url: '',
          status: 'pending'
        }));
      } else if (workflow === 'Video') {
        project.derivedAssets = [
          { type: '360 Spin', url: '', status: 'pending' },
          { type: 'Atmospheric Video', url: '', status: 'pending' }
        ];
      } else if (workflow === 'Ad') {
        project.derivedAssets = [
          { type: 'PMax Creative', url: '', status: 'pending' },
          { type: 'Social Media Ad', url: '', status: 'pending' }
        ];
      }

      if (matchingSkus.length > 0 && workflow === 'Main') {
        project.derivedAssets.push({ type: 'Set/Stack View', url: '', status: 'pending' });
      }

      return project;
    });

    setProjects([...newProjects, ...projects]);
    setIsCreating(false);
    setCreationStep(1);
    setNewProjectData({
      sku: '',
      workflow: 'Main',
      category: 'Ring',
      material: '14k Gold',
      weight: '',
      size: '',
      notes: '',
      matchingSkus: '',
      standardId: '',
      placeholderId: '',
      metalId: 'std-metal-14k-gold',
      mainItem: '',
      matchingItem: '',
      detailTypes: [],
      threeViewSources: [],
      threeViews: { front: '', side: '', back: '' }
    });
  };

  const handleCalibrateMain = async (projectId: string) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: 'calibrating' } : p));
    
    try {
      const project = projects.find(p => p.id === projectId);
      if (!project) return;

      // Extract size and notes if missing
      let updatedSpecs = { ...project.specs };
      if (!updatedSpecs.size && project.threeViewSources.length > 0) {
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const analysisResponse = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [
              {
                parts: [
                  { text: `Analyze these jewelry CAD drawings (Multi-View). Extract the physical dimensions (Size) and any detailed notes (stone types, sizes, quantities). Return ONLY valid JSON.` },
                  ...project.threeViewSources.slice(0, 5).map(src => ({
                    inlineData: {
                      data: src.split(',')[1],
                      mimeType: 'image/png'
                    }
                  }))
                ]
              }
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  size: { type: Type.STRING },
                  notes: { type: Type.STRING }
                }
              }
            }
          });
          
          let text = analysisResponse.text;
          const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```([\s\S]*?)```/);
          if (jsonMatch) text = jsonMatch[1];
          const data = JSON.parse(text.trim());
          
          if (data) {
            updatedSpecs.size = data.size || updatedSpecs.size;
            updatedSpecs.notes = data.notes || updatedSpecs.notes;
            
            setProjects(prev => prev.map(p => p.id === projectId ? { ...p, specs: updatedSpecs } : p));
          }
        } catch (e) {
          console.error("Failed to extract specs during calibration", e);
        }
      }

      const mainStd = standards.find(s => s.id === project.standardId);
      const placeholderStd = standards.find(s => s.id === project.placeholderId);
      
      // Recursive function to get all inherited prompts
      const getFullPrompt = (std?: Standard, visited = new Set<string>()): string => {
        if (!std || visited.has(std.id)) return '';
        visited.add(std.id);
        let basePrompt = std.prompt || '';
        if (std.componentIds && std.componentIds.length > 0) {
          const componentPrompts = std.componentIds
            .map(id => standards.find(s => s.id === id))
            .map(comp => getFullPrompt(comp, visited))
            .filter(Boolean);
          basePrompt = `${basePrompt}. ${componentPrompts.join('. ')}`;
        }
        return basePrompt;
      };

      const combinedMainPrompt = getFullPrompt(mainStd);

      // Necklace Chain Logic: If category is Necklace but source only has pendant, add chain.
      let necklaceChainRule = '';
      if (project.category.includes('necklace')) {
        necklaceChainRule = `
          CRITICAL BUSINESS RULE: The current category is "${project.category}". 
          If the provided 3D Multi-View source images ONLY contain a pendant (no chain), 
          you MUST automatically add and render a matching necklace chain as defined in the alignment guide or components. 
          Do NOT render the pendant in isolation unless the category is explicitly "charms & pendants".
          ${project.category === 'necklace with pendant' ? 'Note: This specific category requires a secondary chain drop hanging below the main chain, holding a pendant.' : ''}
        `;
      } else if (project.category === 'charms & pendants') {
        necklaceChainRule = `
          CRITICAL BUSINESS RULE: The current category is "charms & pendants". 
          You MUST render the item as a standalone pendant/charm WITHOUT any necklace chain. 
          Focus exclusively on the item and its bail.
        `;
      }

      const getCalibrationPrompt = (metalStd?: Standard) => {
        return `
          TASK: Generate a hyper-realistic jewelry product image.
          CATEGORY: ${project.category}.
          MATERIAL: ${project.specs.material}. 
          METAL TEXTURE: ${metalStd?.prompt || 'Polished finish'}.
          ${combinedMainPrompt ? `STYLE: ${combinedMainPrompt}.` : ''}
          ${necklaceChainRule}
          BACKGROUND: ${mainStd?.backgroundColor || 'Pure white'}.
          
          CRITICAL CONSTRAINTS:
          1. GEOMETRY: The provided 3D drawings (Multi-View) are the ABSOLUTE SOURCE OF TRUTH. Reconstruct the 3D object from all provided views (front, side, back, top, etc.).
          2. NO LANDSCAPES: Do NOT generate scenery, nature, mountains, or stars.
          3. NO PEOPLE: No hands, no skin, no models.
          4. FOCUS: Only the jewelry item on the specified background.
          5. QUALITY: Hyper-realistic, professional product photography.
        `;
      };

      const getReferenceImages = (metalStd?: Standard) => {
        const refs = [
          ...project.threeViewSources,
          mainStd?.referenceImage,
          placeholderStd?.referenceImage,
          metalStd?.referenceImage
        ].filter(Boolean) as string[];
        
        // Also include plural reference images if they exist
        if (mainStd?.referenceImages) refs.push(...mainStd.referenceImages);
        if (placeholderStd?.referenceImages) refs.push(...placeholderStd.referenceImages);
        if (metalStd?.referenceImages) refs.push(...metalStd.referenceImages);
        
        return Array.from(new Set(refs)); // Deduplicate
      };

      showToast(`Starting calibration for ${project.sku}...`, "info");
      
      const metalStd = standards.find(s => s.id === project.metalId) || standards.find(s => s.type === 'Metal');
      
      const initialMetalImages = [{ metal: metalStd?.name || 'Unknown', url: '' }];

      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, mainImages: initialMetalImages } : p));

      const url = await generateWithGemini(getCalibrationPrompt(metalStd), getReferenceImages(metalStd));

      if (url) {
        showToast("Calibration complete!", "success");
        setProjects(prev => prev.map(p => {
          if (p.id === projectId) {
            return { 
              ...p, 
              status: 'calibrated',
              mainImages: [{ metal: metalStd?.name || 'Unknown', url }],
              mainImage: url 
            };
          }
          return p;
        }));
      } else {
        throw new Error("Generation returned null");
      }
    } catch (error) {
      console.error("Calibration failed:", error);
      showToast("Calibration failed. Please try again.", "error");
      setProjects(prev => prev.map(p => {
        if (p.id === projectId) {
          const metalStd = standards.find(s => s.id === p.metalId) || standards.find(s => s.type === 'Metal');
          return {
            ...p,
            status: 'input',
            mainImages: [{ metal: metalStd?.name || 'Unknown', url: 'FAILED' }]
          };
        }
        return p;
      }));
    }
  };

  const handleRefineAsset = async () => {
    if (!refiningAsset || !refinementPrompt) return;
    setIsRefining(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      // Using gemini-2.5-flash-image for image editing
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: refiningAsset.url.split(',')[1],
                mimeType: 'image/png',
              },
            },
            { text: `Refine this jewelry image: ${refinementPrompt}. Maintain the SKU consistency and high-end aesthetic.` },
          ],
        },
      });

      let refinedUrl = '';
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            refinedUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (refinedUrl) {
        setProjects(prev => prev.map(p => {
          if (p.id === refiningAsset.projectId) {
            if (refiningAsset.assetType === 'Main') {
              return { ...p, mainImage: refinedUrl };
            } else if (refiningAsset.assetType.startsWith('Master (')) {
              const metalName = refiningAsset.assetType.replace('Master (', '').replace(')', '');
              return {
                ...p,
                mainImages: p.mainImages?.map(img => img.metal === metalName ? { ...img, url: refinedUrl } : img)
              };
            } else {
              return {
                ...p,
                derivedAssets: p.derivedAssets.map(a => 
                  a.type === refiningAsset.assetType ? { ...a, url: refinedUrl } : a
                )
              };
            }
          }
          return p;
        }));
        setRefiningAsset(null);
        setRefinementPrompt('');
        showToast("Image refined successfully!", "success");
      } else {
        throw new Error("Refinement returned no image data");
      }
    } catch (error) {
      console.error("Refinement Error:", error);
      showToast("Refinement failed. Please try again.", "error");
    } finally {
      setIsRefining(false);
    }
  };

  const downloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      // Fallback to simple link
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDeriveSingleAsset = async (projectId: string, standardId: string) => {
    const project = projects.find(p => p.id === projectId);
    const standard = standards.find(s => s.id === standardId);
    if (!project || !standard || !project.mainImage) return;

    // Add a pending asset to the project
    const newAssetIndex = project.derivedAssets.length;
    setProjects(prev => prev.map(p => p.id === projectId ? {
      ...p,
      derivedAssets: [...p.derivedAssets, { type: standard.name, url: '', status: 'pending' }]
    } : p));

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const metalStd = standards.find(s => s.id === project.metalId);
      const derivePrompt = `
        TASK: Generate a hyper-realistic jewelry asset based on the provided master shot.
        STYLE: ${standard.prompt || ''}. 
        ${metalStd ? `METAL CONSISTENCY: ${metalStd.prompt}.` : ''}
        MATERIAL: ${project.specs.material}. 
        
        CRITICAL CONSTRAINTS:
        1. NO LANDSCAPES: Do NOT generate scenery, nature, or people.
        2. CONSISTENCY: Maintain the exact geometry and SKU details from the master shot.
        3. FOCUS: Only the jewelry item in the requested style/angle.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { data: project.mainImage.split(',')[1], mimeType: 'image/png' } },
            { text: derivePrompt }
          ]
        }
      });

      let url = '';
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          url = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (url) {
        setProjects(prev => prev.map(p => p.id === projectId ? {
          ...p,
          derivedAssets: p.derivedAssets.map((a, i) => i === newAssetIndex ? { ...a, url, status: 'completed' } : a)
        } : p));
      }
    } catch (error) {
      console.error('Derivation error:', error);
      setProjects(prev => prev.map(p => p.id === projectId ? {
        ...p,
        derivedAssets: p.derivedAssets.filter((_, i) => i !== newAssetIndex)
      } : p));
    }
  };

  const handleDeriveAssets = async (projectId: string) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: 'deriving' } : p));
    
    try {
      const project = projects.find(p => p.id === projectId);
      if (!project?.mainImage) return;

      const derived = await Promise.all(project.derivedAssets.map(async (asset) => {
        // Intelligent matching for derivation
        let type: Standard['type'] = 'Scene';
        if (asset.type.includes('Model')) type = 'Model';
        else if (asset.type.includes('Video')) type = 'Video';
        else if (asset.type.includes('Set')) type = 'Set';

        const bestStd = findBestStandard(
          type,
          project.category,
          project.specs.material
        );

        const metalStd = standards.find(s => s.id === project.metalId);

        const derivePrompt = `
          ${bestStd?.prompt || ''}. 
          ${metalStd ? `Maintain metal consistency: ${metalStd.prompt}.` : ''}
          Based on this master jewelry shot and the original 3D drawings. 
          CRITICAL: You MUST maintain the EXACT geometry, shape, and intricate details of the jewelry as shown in the master image and the 3D source drawings. 
          The scene or model should interact with the jewelry naturally, but the jewelry itself must remain an identical 1:1 replica of the design.
          Maintain ${project.specs.material} consistency. 
          Physical Specs: Weight ${project.specs.weight}, Size ${project.specs.size}. 
          Details: ${project.specs.notes}
        `;
        const url = await generateWithGemini(derivePrompt, [
          project.mainImage, 
          ...project.threeViewSources,
          bestStd?.referenceImage,
          metalStd?.referenceImage
        ]);
        return { ...asset, url, status: 'completed' as const };
      }));

      setProjects(prev => prev.map(p => {
        if (p.id === projectId) {
          return {
            ...p,
            status: 'completed',
            derivedAssets: derived
          };
        }
        return p;
      }));
    } catch (error) {
      console.error("Derivation failed:", error);
      showToast("Derivation failed. Please try again.", "error");
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: 'calibrated' } : p));
    }
  };

  if (isCheckingKey) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0A0A0A]">
        <Loader2 className="text-white animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-emerald-500/30">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-72 bg-[#111111] border-r border-white/5 z-20 flex flex-col">
        <div className="p-8 flex-shrink-0">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <Sparkles className="text-black w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight">JewelryAI</h1>
              <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Pro Workflow</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto px-8 space-y-2 custom-scrollbar pb-8">
          <button 
            onClick={() => setActiveWorkflow('MainImage')}
            className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${activeWorkflow === 'MainImage' ? 'bg-white/10 text-white border border-white/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <ImageIcon size={20} />
            <span className="font-semibold">Main Image</span>
          </button>
          <button 
            onClick={() => setActiveWorkflow('DetailAssets')}
            className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${activeWorkflow === 'DetailAssets' ? 'bg-white/10 text-white border border-white/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Layers size={20} />
            <span className="font-semibold">Detail Assets</span>
          </button>
          <button 
            onClick={() => setActiveWorkflow('VideoAssets')}
            className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${activeWorkflow === 'VideoAssets' ? 'bg-white/10 text-white border border-white/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Video size={20} />
            <span className="font-semibold">Video Assets</span>
          </button>
          <div className="h-px bg-white/5 my-4" />
          <button 
            onClick={() => setActiveWorkflow('Library')}
            className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${activeWorkflow === 'Library' ? 'bg-white/10 text-white border border-white/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <FolderOpen size={20} />
            <span className="font-semibold">Library</span>
          </button>
          <button 
            onClick={() => setActiveWorkflow('Standards')}
            className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${activeWorkflow === 'Standards' ? 'bg-white/10 text-white border border-white/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Settings size={20} />
            <span className="font-semibold">Standards</span>
          </button>
          <button 
            onClick={() => setActiveWorkflow('Agent')}
            className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${activeWorkflow === 'Agent' ? 'bg-white/10 text-white border border-white/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <User size={20} />
            <span className="font-semibold">Agent Tools</span>
          </button>

          {/* Dynamic Standard Categories in Sidebar */}
          <AnimatePresence>
            {activeWorkflow === 'Standards' && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="ml-6 space-y-1 overflow-hidden"
              >
                {standardTypes.map(type => (
                  <button
                    key={type}
                    onClick={() => setActiveStandardType(type)}
                    className={`w-full text-left px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeStandardType === type ? 'text-emerald-500 bg-emerald-500/5' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`}
                  >
                    {type}
                  </button>
                ))}
                <button
                  onClick={() => setIsAddingStandardType(true)}
                  className="w-full text-left px-4 py-2 rounded-xl text-xs font-bold text-emerald-500/50 hover:text-emerald-500 flex items-center gap-2 transition-all"
                >
                  <Plus size={12} />
                  Add Category
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        <div className="p-8 flex-shrink-0 border-t border-white/5 bg-[#111111]">
          <div className={`p-4 rounded-2xl border transition-all ${hasApiKey ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <span className="text-xs font-bold uppercase tracking-wider">{hasApiKey ? 'API Connected' : 'API Required'}</span>
              </div>
              {hasApiKey && (
                <button 
                  onClick={handleConnectKey}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
                  title="Configure API Key"
                >
                  <Settings size={14} />
                </button>
              )}
            </div>
            {!hasApiKey ? (
              <button 
                onClick={handleConnectKey}
                className="w-full py-2 bg-amber-500 text-black text-xs font-bold rounded-lg hover:bg-amber-400 transition-colors"
              >
                Connect Paid Key
              </button>
            ) : (
              <p className="text-[10px] text-white/40">Gemini 3.1 Flash Image Active</p>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-72 p-12">
        {/* Agent Tools Workflow */}
        {activeWorkflow === 'Agent' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto space-y-12"
          >
            <div className="space-y-4">
              <h3 className="text-3xl font-bold tracking-tight">Agent Integration Tools</h3>
              <p className="text-white/40 text-sm">Use these tools to connect your Jewelry AI Workstation to external agents like LobeChat (龙虾), Feishu, or custom bots.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-[#151515] rounded-[32px] p-8 border border-white/5 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                    <Monitor size={20} />
                  </div>
                  <h4 className="font-bold">Webhook Endpoint</h4>
                </div>
                <p className="text-xs text-white/40 leading-relaxed">
                  Send a POST request to this URL to trigger actions on your workstation from any external system.
                </p>
                <div className="bg-black/40 rounded-2xl p-4 font-mono text-[10px] text-emerald-500 break-all border border-white/5">
                  {window.location.origin}/api/agent/command
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/20">Example Payload</p>
                  <pre className="bg-black/40 rounded-2xl p-4 font-mono text-[10px] text-white/60 overflow-x-auto border border-white/5">
{`{
  "command": "generate_main_image",
  "params": {
    "sku": "SKU-888",
    "metalId": "std-metal-silver"
  }
}`}
                  </pre>
                </div>
              </div>

              <div className="bg-[#151515] rounded-[32px] p-8 border border-white/5 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                    <Key size={20} />
                  </div>
                  <h4 className="font-bold">Gemini Tool Definition</h4>
                </div>
                <p className="text-xs text-white/40 leading-relaxed">
                  Copy this JSON into LobeChat or Gemini API "Tools" configuration to allow the AI to control this workstation.
                </p>
                <div className="relative group">
                  <pre className="bg-black/40 rounded-2xl p-4 font-mono text-[10px] text-white/60 h-64 overflow-y-auto custom-scrollbar border border-white/5">
{`{
  "name": "execute_jewelry_command",
  "description": "Control the Jewelry AI Workstation",
  "parameters": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "enum": ["generate_main_image", "switch_workflow"],
        "description": "Action to perform"
      },
      "params": {
        "type": "object",
        "properties": {
          "sku": { "type": "string" },
          "metalId": { "type": "string" },
          "workflow": { "type": "string" }
        }
      }
    },
    "required": ["command", "params"]
  }
}`}
                  </pre>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify({
                        name: "execute_jewelry_command",
                        description: "Control the Jewelry AI Workstation",
                        parameters: {
                          type: "object",
                          properties: {
                            command: {
                              type: "string",
                              enum: ["generate_main_image", "switch_workflow"],
                              description: "Action to perform"
                            },
                            params: {
                              type: "object",
                              properties: {
                                sku: { "type": "string" },
                                metalId: { "type": "string" },
                                workflow: { "type": "string" }
                              }
                            }
                          },
                          required: ["command", "params"]
                        }
                      }, null, 2));
                      showToast("Tool definition copied!", "success");
                    }}
                    className="absolute top-4 right-4 p-2 bg-emerald-500 text-black rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-[32px] p-8 flex items-start gap-6">
              <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-black flex-shrink-0">
                <Info size={24} />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-emerald-500">How it works</h4>
                <p className="text-xs text-white/60 leading-relaxed">
                  1. External agents send commands to the Webhook URL.<br/>
                  2. The server relays these commands to your open browser tab via WebSockets.<br/>
                  3. Your browser executes the AI generation using your connected API key.<br/>
                  <strong>Note:</strong> Keep this tab open to receive commands from external agents.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        <header className="flex justify-between items-end mb-16">
          <div>
            <div className="flex items-center gap-2 text-emerald-500 mb-2">
              <Monitor size={14} />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Workstation v3.0</span>
            </div>
            <h2 className="text-5xl font-bold tracking-tighter">
              {activeWorkflow === 'MainImage' ? 'Main Image Generator' : 
               activeWorkflow === 'DetailAssets' ? 'Detail Assets Generator' : 
               activeWorkflow === 'VideoAssets' ? 'Video Assets Generator' : 
               activeWorkflow === 'Standards' ? 'Production Standards' : 'Product Library'}
            </h2>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeWorkflow === 'MainImage' && (
            <motion.div 
              key="main-image"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-12"
            >
              {/* Input Section */}
              <div className="bg-[#151515] rounded-[40px] p-10 border border-white/5 space-y-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-center ml-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">1. Upload 3D Four-View Drawing</label>
                    <span className="text-[10px] font-bold text-emerald-500/50 uppercase tracking-widest">Single Image with Multi-Angles</span>
                  </div>
                  <div 
                    onClick={() => document.getElementById('four-view-upload')?.click()}
                    className={`h-96 border-2 border-dashed rounded-[32px] flex flex-col items-center justify-center gap-4 cursor-pointer transition-all group relative overflow-hidden ${
                      mainImageData.fourViewSource ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 hover:border-emerald-500/30 hover:bg-white/5'
                    }`}
                  >
                    <input 
                      id="four-view-upload"
                      type="file" 
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            const base64 = reader.result as string;
                            setMainImageData(prev => ({ ...prev, fourViewSource: base64 }));
                            analyzeThreeViewImage(base64).then((data: AnalysisData | null) => {
                              if (data) {
                                setMainImageData(prev => ({ 
                                  ...prev, 
                                  sku: data.sku || prev.sku,
                                  category: (data.category as any) || prev.category,
                                  material: data.material || prev.material
                                }));
                              }
                            });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    {mainImageData.fourViewSource ? (
                      <>
                        <img src={mainImageData.fourViewSource} className="w-full h-full object-contain p-4" alt="Source" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                          <p className="text-xs font-bold text-white uppercase tracking-widest">Click to Replace</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-white/20 group-hover:text-emerald-500 group-hover:bg-emerald-500/10 transition-all">
                          <Plus size={40} />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-white/60">Drop 3D CAD Drawing Here</p>
                          <p className="text-[10px] text-white/20 mt-1 uppercase tracking-widest">AI will auto-extract SKU & Category</p>
                        </div>
                      </>
                    )}
                    {isAnalyzing && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                        <Loader2 className="animate-spin text-emerald-500" size={32} />
                        <p className="text-xs font-bold text-white uppercase tracking-widest animate-pulse">Analyzing Drawing...</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">SKU Name</label>
                  <input 
                    type="text"
                    value={mainImageData.sku}
                    onChange={(e) => setMainImageData(prev => ({ ...prev, sku: e.target.value }))}
                    placeholder="e.g. RING-001"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">1. Select Placeholder (Angle/Pos)</label>
                    <select 
                      value={mainImageData.placeholderId}
                      onChange={(e) => setMainImageData(prev => ({ ...prev, placeholderId: e.target.value }))}
                      className="w-full bg-white/5 border border-emerald-500/20 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all appearance-none cursor-pointer font-bold text-emerald-500"
                    >
                      <option value="custom">-- Use Custom Upload --</option>
                      {standards.filter(s => s.type === 'Placeholder').map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">2. Select Main Style (Lighting/BG)</label>
                    <select 
                      value={mainImageData.standardId}
                      onChange={(e) => setMainImageData(prev => ({ ...prev, standardId: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all appearance-none cursor-pointer"
                    >
                      {standards.filter(s => s.type === 'Main').map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {mainImageData.placeholderId === 'custom' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center ml-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Custom Reference Image (垫图)</label>
                      <span className="text-[10px] font-bold text-emerald-500/50 uppercase tracking-widest">Upload for Composition</span>
                    </div>
                    <div 
                      onClick={() => document.getElementById('custom-placeholder-upload')?.click()}
                      className={`h-48 border-2 border-dashed rounded-[32px] flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group relative overflow-hidden ${
                        mainImageData.customPlaceholderSource ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 hover:border-emerald-500/30 hover:bg-white/5'
                      }`}
                    >
                      <input 
                        id="custom-placeholder-upload"
                        type="file" 
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setMainImageData(prev => ({ ...prev, customPlaceholderSource: reader.result as string }));
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      {mainImageData.customPlaceholderSource ? (
                        <img src={mainImageData.customPlaceholderSource} className="w-full h-full object-contain p-4" alt="Custom Placeholder" />
                      ) : (
                        <>
                          <Plus size={24} className="text-white/20 group-hover:text-emerald-500 transition-all" />
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Upload Composition Reference</p>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">Main Stone (Optional)</label>
                    <input 
                      type="text"
                      value={mainImageData.mainStone}
                      onChange={(e) => setMainImageData(prev => ({ ...prev, mainStone: e.target.value }))}
                      placeholder="e.g. Zircon, Diamond"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">Main Stone Color</label>
                    <input 
                      type="text"
                      value={mainImageData.mainStoneColor}
                      onChange={(e) => setMainImageData(prev => ({ ...prev, mainStoneColor: e.target.value }))}
                      placeholder="e.g. Clear, Red, Blue"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">Stone Cut (Optional)</label>
                    <input 
                      type="text"
                      value={mainImageData.stoneCut}
                      onChange={(e) => setMainImageData(prev => ({ ...prev, stoneCut: e.target.value }))}
                      placeholder="e.g. Round, Emerald, Pear"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">Side Stone (Optional)</label>
                    <input 
                      type="text"
                      value={mainImageData.sideStone}
                      onChange={(e) => setMainImageData(prev => ({ ...prev, sideStone: e.target.value }))}
                      placeholder="e.g. Small Zircon"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">Side Stone Color</label>
                  <input 
                    type="text"
                    value={mainImageData.sideStoneColor}
                    onChange={(e) => setMainImageData(prev => ({ ...prev, sideStoneColor: e.target.value }))}
                    placeholder="e.g. Clear"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">Stone Rendering Standard</label>
                  <select 
                    value={mainImageData.stoneId}
                    onChange={(e) => setMainImageData(prev => ({ ...prev, stoneId: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all appearance-none cursor-pointer font-bold text-emerald-500"
                  >
                    <option value="">Default (Clear Zircon)</option>
                    {standards.filter(s => s.type === 'Stone').map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">3. Metal Skill (Color/Texture)</label>
                  <div className="grid grid-cols-3 gap-3">
                    {standards.filter(s => s.type === 'Metal').map(m => (
                      <button
                        key={m.id}
                        onClick={() => setMainImageData(prev => ({ ...prev, targetMetal: m.id }))}
                        className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                          mainImageData.targetMetal === m.id ? 'bg-emerald-500 text-black border-emerald-500 shadow-[0_10px_20px_rgba(16,185,129,0.2)]' : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {m.name.replace(' Texture', '')}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  id="generate-main-btn"
                  onClick={handleMainImageGenerate}
                  disabled={mainImageData.status === 'generating'}
                  className="w-full bg-emerald-500 text-black py-6 rounded-[24px] font-black uppercase tracking-[0.2em] text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_20px_40px_rgba(16,185,129,0.2)] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-3 group"
                >
                  {mainImageData.status === 'generating' ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      <span>Synthesizing Rendering...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
                      <span>Execute Main Rendering</span>
                    </>
                  )}
                </button>
              </div>

              {/* Output Section */}
              <div className="bg-[#151515] rounded-[40px] p-10 border border-white/5 flex flex-col items-center justify-center relative overflow-hidden min-h-[600px]">
                {mainImageData.status === 'generating' ? (
                  <div className="flex flex-col items-center gap-8">
                    <div className="relative">
                      <div className="w-40 h-40 rounded-full border-4 border-emerald-500/5 border-t-emerald-500 animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center">
                          <ImageIcon className="text-emerald-500 animate-pulse" size={40} />
                        </div>
                      </div>
                    </div>
                    <div className="text-center space-y-3">
                      <p className="text-2xl font-bold tracking-tight text-white">AI Engine Rendering</p>
                      <div className="flex flex-col gap-1">
                        <p className="text-[10px] text-emerald-500/60 uppercase tracking-[0.2em] font-black">Applying Metal Standards...</p>
                        <p className="text-[10px] text-white/20 uppercase tracking-[0.2em] font-black">Calibrating Perspective...</p>
                      </div>
                    </div>
                  </div>
                ) : mainImageData.generatedUrl ? (
                  <div className="w-full h-full flex flex-col">
                    <div className="flex-1 rounded-[32px] overflow-hidden bg-white relative group shadow-2xl">
                      <img 
                        src={mainImageData.generatedUrl} 
                        className="w-full h-full object-contain" 
                        alt="Generated" 
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-all flex justify-between items-center">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setRefiningAsset({
                                projectId: 'main-image-gen',
                                assetType: 'Main Image',
                                url: mainImageData.generatedUrl!
                              });
                            }}
                            className="px-4 py-2 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-emerald-500 transition-colors flex items-center gap-2"
                          >
                            <Sparkles size={12} />
                            Refine
                          </button>
                          <button 
                            onClick={() => downloadFile(mainImageData.generatedUrl, `${mainImageData.sku || 'jewelry'}-main.png`)}
                            className="px-4 py-2 bg-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-white/20 transition-colors flex items-center gap-2 backdrop-blur-md border border-white/10"
                          >
                            <Download size={12} />
                            Save
                          </button>
                        </div>
                        <div className="text-[10px] font-bold text-white/60 uppercase tracking-widest">
                          Rendered in 1K
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex items-center justify-between px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                          <CheckCircle2 className="text-emerald-500" size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white uppercase tracking-widest">Master Shot Ready</p>
                          <p className="text-[10px] text-white/40 uppercase tracking-widest">Saved to Product Library</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setMainImageData({
                          fourViewSource: null,
                          sku: '',
                          category: 'Ring',
                          targetMetal: 'silver-texture',
                          backgroundColor: '#FFFFFF',
                          generatedUrl: null,
                          status: 'idle',
                          material: 'Silver',
                          weight: '',
                          size: '',
                          notes: ''
                        })}
                        className="text-[10px] font-black text-white/20 hover:text-white uppercase tracking-widest transition-colors"
                      >
                        Reset Workspace
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-6 opacity-10">
                    <ImageIcon size={120} className="mx-auto" />
                    <p className="text-xs font-black uppercase tracking-[0.4em]">Production Output</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeWorkflow === 'DetailAssets' && (
            <motion.div 
              key="detail-assets"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {/* Configuration Panel */}
              <div className="bg-[#151515] rounded-[40px] p-10 border border-white/5 space-y-8">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">1. Select Main Item from Library</label>
                    <div className="grid grid-cols-4 gap-3">
                      {productRegistry.slice(0, 4).map(item => (
                        <button
                          key={item.sku}
                          onClick={() => {
                            const mainItem = productRegistry.find(i => i.sku === item.sku);
                            const bestScene = mainItem ? findBestStandard('Scene', mainItem.category, mainItem.specs.material) : null;
                            const bestModel = mainItem ? findBestStandard('Model', mainItem.category, mainItem.specs.material) : null;
                            setDetailAssetsData(prev => ({ 
                              ...prev, 
                              mainItemSku: item.sku,
                              sceneStandardId: bestScene?.id || prev.sceneStandardId,
                              modelStandardId: bestModel?.id || prev.modelStandardId
                            }));
                          }}
                          className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all ${
                            detailAssetsData.mainItemSku === item.sku ? 'border-emerald-500 scale-105 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'border-white/5 hover:border-white/20'
                          }`}
                        >
                          <img src={item.mainImages[0]?.url} className="w-full h-full object-cover" alt={item.sku} />
                          <div className="absolute inset-0 bg-black/40 flex items-end p-2">
                            <span className="text-[8px] font-bold text-white truncate">{item.sku}</span>
                          </div>
                        </button>
                      ))}
                      <button 
                        onClick={() => setActiveWorkflow('Library')}
                        className="aspect-square rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-2 text-white/20 hover:text-white/40 hover:bg-white/5 transition-all"
                      >
                        <FolderOpen size={20} />
                        <span className="text-[8px] font-bold uppercase tracking-widest">More</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">2. Optional: Matching Item (Set)</label>
                    <div className="grid grid-cols-4 gap-3">
                      {productRegistry.slice(0, 4).map(item => (
                        <button
                          key={item.sku}
                          onClick={() => setDetailAssetsData(prev => ({ ...prev, matchingItemSku: detailAssetsData.matchingItemSku === item.sku ? '' : item.sku }))}
                          className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all ${
                            detailAssetsData.matchingItemSku === item.sku ? 'border-emerald-500 scale-105 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'border-white/5 hover:border-white/20'
                          }`}
                        >
                          <img src={item.mainImages[0]?.url} className="w-full h-full object-cover" alt={item.sku} />
                          <div className="absolute inset-0 bg-black/40 flex items-end p-2">
                            <span className="text-[8px] font-bold text-white truncate">{item.sku}</span>
                          </div>
                          {detailAssetsData.matchingItemSku === item.sku && (
                            <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                              <Check size={10} className="text-black" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">Scene Standard</label>
                      <select 
                        value={detailAssetsData.sceneStandardId}
                        onChange={(e) => setDetailAssetsData(prev => ({ ...prev, sceneStandardId: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all appearance-none cursor-pointer"
                      >
                        <option value="">Auto-Match (Best Fit)</option>
                        {standards.filter(s => s.type === 'Scene' || s.type === 'Main').map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">Model Standard</label>
                      <select 
                        value={detailAssetsData.modelStandardId}
                        onChange={(e) => setDetailAssetsData(prev => ({ ...prev, modelStandardId: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all appearance-none cursor-pointer"
                      >
                        <option value="">Auto-Match (Best Fit)</option>
                        {standards.filter(s => s.type === 'Model').map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center ml-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">3. Scale Reference (3D Drawing)</label>
                      <span className="text-[8px] font-bold text-emerald-500/50 uppercase tracking-widest">Ensures Correct Proportions</span>
                    </div>
                    <div 
                      onClick={() => document.getElementById('size-ref-upload')?.click()}
                      className={`h-40 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all group relative overflow-hidden ${
                        detailAssetsData.sizeRefSource ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 hover:border-emerald-500/30 hover:bg-white/5'
                      }`}
                    >
                      <input 
                        id="size-ref-upload"
                        type="file" 
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => setDetailAssetsData(prev => ({ ...prev, sizeRefSource: reader.result as string }));
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      {detailAssetsData.sizeRefSource ? (
                        <img src={detailAssetsData.sizeRefSource} className="w-full h-full object-contain p-2" alt="Size Ref" />
                      ) : (
                        <>
                          <Ruler size={24} className="text-white/20 group-hover:text-emerald-500 transition-colors" />
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Upload 3D Drawing for Scale</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleDetailAssetsGenerate}
                  disabled={detailAssetsData.status === 'generating'}
                  className="w-full bg-emerald-500 text-black py-6 rounded-[24px] font-black uppercase tracking-[0.2em] text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_20px_40_rgba(16,185,129,0.2)] disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {detailAssetsData.status === 'generating' ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      <span>Synthesizing Assets...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} />
                      <span>Generate Marketing Suite</span>
                    </>
                  )}
                </button>
              </div>

              {/* Results Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  { id: 'mainScene', label: 'Main Item Scene', desc: 'Lifestyle background' },
                  { id: 'setScene', label: 'Set/Stack Scene', desc: 'Multi-item composition' },
                  { id: 'mainModel', label: 'Model Wear (Focus)', desc: 'Product-centric wearing' },
                  { id: 'setModel', label: 'Set Model Wear', desc: 'Full set wearing' }
                ].map((asset) => (
                  <div key={asset.id} className="bg-[#151515] rounded-[32px] border border-white/5 overflow-hidden flex flex-col h-[420px] group hover:border-emerald-500/20 transition-all shadow-xl">
                    <div className="flex-1 bg-[#0D0D0D] relative overflow-hidden">
                      {detailAssetsData.status === 'generating' ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                          <div className="w-10 h-10 rounded-full border-2 border-emerald-500/10 border-t-emerald-500 animate-spin" />
                          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-500/60 animate-pulse">Rendering...</span>
                        </div>
                      ) : detailAssetsData.results[asset.id as keyof typeof detailAssetsData.results] ? (
                        <>
                          <img 
                            src={detailAssetsData.results[asset.id as keyof typeof detailAssetsData.results]!} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                            alt={asset.label} 
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-all flex justify-center gap-2">
                            <button 
                              onClick={() => setRefiningAsset({ 
                                projectId: 'detail-assets', 
                                assetType: asset.label, 
                                url: detailAssetsData.results[asset.id as keyof typeof detailAssetsData.results]! 
                              })}
                              className="px-3 py-2 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-emerald-500 transition-colors flex items-center gap-2"
                            >
                              <Sparkles size={12} />
                              Refine
                            </button>
                            <button 
                              onClick={() => downloadFile(detailAssetsData.results[asset.id as keyof typeof detailAssetsData.results]!, `${detailAssetsData.mainItemSku}-${asset.id}.png`)}
                              className="px-3 py-2 bg-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-white/20 transition-colors flex items-center gap-2 backdrop-blur-md border border-white/10"
                            >
                              <Download size={12} />
                              Save
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-4 opacity-20 group-hover:opacity-40 transition-opacity">
                          <ImageIcon size={48} />
                          <span className="text-[8px] font-black uppercase tracking-[0.2em]">Awaiting Data</span>
                        </div>
                      )}
                    </div>
                    <div className="p-5 border-t border-white/5 flex justify-between items-center">
                      <div>
                        <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">{asset.label}</p>
                        <p className="text-[8px] text-white/40 uppercase tracking-widest font-bold">{asset.desc}</p>
                      </div>
                      {detailAssetsData.results[asset.id as keyof typeof detailAssetsData.results] && (
                        <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeWorkflow === 'VideoAssets' && (
            <motion.div 
              key="video-assets"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-12"
            >
              {/* Configuration Panel */}
              <div className="bg-[#151515] rounded-[40px] p-10 border border-white/5 space-y-10">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">1. Select Product for Video</label>
                    <div className="grid grid-cols-4 gap-4 max-h-[200px] overflow-y-auto p-2 scrollbar-hide">
                      {productRegistry.length > 0 ? (
                        productRegistry.map(item => (
                          <button
                            key={item.sku}
                            onClick={() => {
                              const mainItem = productRegistry.find(i => i.sku === item.sku);
                              const bestVideo = mainItem ? findBestStandard('Video', mainItem.category, mainItem.specs.material) : null;
                              setVideoAssetsData(prev => ({ 
                                ...prev, 
                                mainItemSku: item.sku,
                                standardId: bestVideo?.id || prev.standardId
                              }));
                            }}
                            className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all ${
                              videoAssetsData.mainItemSku === item.sku ? 'border-emerald-500 scale-105 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'border-white/5 hover:border-white/20'
                            }`}
                          >
                            <img src={item.mainImages[0]?.url || item.mainImage} className="w-full h-full object-cover" alt={item.sku} referrerPolicy="no-referrer" />
                            <div className="absolute inset-x-0 bottom-0 p-2 bg-black/60 backdrop-blur-sm">
                              <span className="text-[8px] font-bold text-white truncate block">{item.sku}</span>
                            </div>
                            {videoAssetsData.mainItemSku === item.sku && (
                              <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                                <Check size={10} className="text-black" />
                              </div>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="col-span-4 py-8 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                          <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">No products in library</p>
                          <button 
                            onClick={() => setActiveWorkflow('MainImage')}
                            className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mt-2 hover:underline"
                          >
                            Generate a product first
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">2. Choose Cinematic Style</label>
                    <div className="grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto p-1 scrollbar-hide">
                      {VIDEO_TYPES.map((type) => (
                        <button
                          key={type.id}
                          onClick={() => setVideoAssetsData(prev => ({ ...prev, videoTypeId: type.id }))}
                          className={`group p-5 rounded-3xl border-2 text-left transition-all flex items-center gap-4 ${
                            videoAssetsData.videoTypeId === type.id ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/5 hover:border-white/10'
                          }`}
                        >
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all ${
                            videoAssetsData.videoTypeId === type.id ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white/40 group-hover:bg-white/10'
                          }`}>
                            <Video size={20} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-black uppercase tracking-widest text-white">{type.name}</p>
                              {type.id === 'rotating' && <span className="text-[8px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded-full border border-emerald-500/20">Popular</span>}
                            </div>
                            <p className="text-[10px] text-white/40 font-bold mt-1 line-clamp-1">{type.prompt}</p>
                          </div>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                            videoAssetsData.videoTypeId === type.id ? 'bg-emerald-500 scale-100' : 'bg-white/5 scale-75 opacity-0 group-hover:opacity-100'
                          }`}>
                            <Check size={12} className={videoAssetsData.videoTypeId === type.id ? 'text-black' : 'text-white/20'} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">3. Production Standard</label>
                    <select 
                      value={videoAssetsData.standardId}
                      onChange={(e) => setVideoAssetsData(prev => ({ ...prev, standardId: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-3xl px-6 py-5 text-sm focus:outline-none focus:border-emerald-500/50 transition-all appearance-none cursor-pointer"
                    >
                      <option value="">Auto-Match (Best Fit)</option>
                      {standards.filter(s => s.type === 'Video').map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {!hasApiKey ? (
                  <button 
                    onClick={async () => {
                      if ((window as any).aistudio?.openSelectKey) {
                        await (window as any).aistudio.openSelectKey();
                        setHasApiKey(true);
                      }
                    }}
                    className="w-full bg-amber-500 text-black py-6 rounded-[24px] font-black uppercase tracking-[0.2em] text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_20px_40_rgba(245,158,11,0.2)] flex items-center justify-center gap-3"
                  >
                    <Key size={20} />
                    <span>Connect API Key for Video</span>
                  </button>
                ) : (
                  <button 
                    onClick={handleVideoGenerate}
                    disabled={videoAssetsData.status === 'generating'}
                    className="w-full bg-emerald-500 text-black py-6 rounded-[24px] font-black uppercase tracking-[0.2em] text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_20px_40_rgba(16,185,129,0.2)] disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {videoAssetsData.status === 'generating' ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        <span>Rendering Cinematic...</span>
                      </>
                    ) : (
                      <>
                        <Video size={20} />
                        <span>Generate Cinematic Video</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Output Preview */}
              <div className="bg-[#151515] rounded-[40px] border border-white/5 overflow-hidden flex flex-col min-h-[600px] group">
                <div className="flex-1 bg-[#0D0D0D] relative overflow-hidden">
                  {videoAssetsData.status === 'generating' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-12 text-center">
                      <div className="relative">
                        <div className="w-24 h-24 rounded-full border-4 border-emerald-500/10 border-t-emerald-500 animate-spin" />
                        <Video className="absolute inset-0 m-auto text-emerald-500 animate-pulse" size={32} />
                      </div>
                      <div className="space-y-4 w-full max-w-xs">
                        <div className="space-y-2">
                          <h3 className="text-xl font-black uppercase tracking-[0.2em] text-white">Synthesizing Frames</h3>
                          <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest animate-pulse">{videoAssetsData.currentStep}</p>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: "0%" }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 10, ease: "linear" }}
                            className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                          />
                        </div>
                      </div>
                    </div>
                  ) : videoAssetsData.generatedUrl ? (
                    <>
                      <video 
                        src={videoAssetsData.generatedUrl} 
                        className="w-full h-full object-cover" 
                        controls 
                        autoPlay 
                        loop 
                        muted
                      />
                      <div className="absolute top-8 right-8 flex gap-4">
                        <button 
                          onClick={() => downloadFile(videoAssetsData.generatedUrl, `${videoAssetsData.mainItemSku}_video.mp4`)}
                          className="p-5 bg-white text-black rounded-2xl hover:scale-110 transition-transform shadow-2xl"
                        >
                          <Download size={24} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-white/5 gap-6 p-12 text-center">
                      <div className="w-32 h-32 rounded-[40px] border-2 border-dashed border-white/5 flex items-center justify-center">
                        <Video size={64} className="opacity-20" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Output Preview</p>
                        <p className="text-xs font-bold text-white/10 max-w-[200px]">Select a main image and video type to begin generation</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-10 border-t border-white/5 bg-gradient-to-b from-transparent to-black/20">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-2">Production Output</h4>
                      <p className="text-xs font-bold text-white/40">
                        {videoAssetsData.generatedUrl ? 'Cinematic Video Ready' : 'Awaiting Synthesis'}
                      </p>
                    </div>
                    {videoAssetsData.generatedUrl && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500">4K Rendered</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeWorkflow === 'Library' && (
            <motion.div 
              key="library"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {productRegistry.map((item) => (
                  <div key={item.sku} className="bg-[#151515] rounded-[32px] border border-white/5 overflow-hidden group">
                    <div className="aspect-square bg-[#0D0D0D] relative overflow-hidden">
                      {item.mainImages?.[0]?.url ? (
                        <img 
                          src={item.mainImages[0].url} 
                          className="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform duration-500" 
                          alt={item.sku} 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/5">
                          <ImageIcon size={48} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-3">
                        <button className="p-3 bg-white text-black rounded-xl hover:scale-110 transition-transform">
                          <Eye size={18} />
                        </button>
                        <button 
                          onClick={() => {
                            if (item.mainImages?.[0]?.url) downloadFile(item.mainImages[0].url, `${item.sku}_main.png`);
                          }}
                          className="p-3 bg-white text-black rounded-xl hover:scale-110 transition-transform"
                        >
                          <Download size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="p-6">
                      <h4 className="font-bold text-lg tracking-tight">{item.sku}</h4>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mt-1">{item.category} • {item.specs.material}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeWorkflow === 'Standards' && (
            <motion.div 
              key="standards"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-3xl font-bold tracking-tighter">Production Standards</h3>
                  <p className="text-white/40 text-xs uppercase tracking-widest mt-2">Active Category: {activeStandardType}</p>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setEditingStandard(null);
                      setIsCreatingStandard(true);
                    }}
                    className="px-8 py-4 bg-emerald-500 text-black rounded-2xl font-bold text-sm flex items-center gap-2 hover:scale-105 transition-all shadow-lg"
                  >
                    <Plus size={18} /> Add New Standard
                  </button>
                  <button 
                    onClick={exportStandards}
                    className="px-8 py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-white/10 transition-all"
                  >
                    <Download size={18} /> Export
                  </button>
                  <label className="px-8 py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-white/10 transition-all cursor-pointer">
                    <Layers size={18} /> Import
                    <input type="file" accept=".json" onChange={importStandards} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {standards.filter(s => s.type === activeStandardType).map(standard => (
                  <div key={standard.id} className="bg-[#151515] rounded-[32px] border border-white/5 overflow-hidden group hover:border-emerald-500/30 transition-all">
                    <div className="aspect-video bg-[#0D0D0D] relative overflow-hidden">
                      {standard.referenceImage ? (
                        <img src={standard.referenceImage} alt={standard.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/5">
                          <ImageIcon size={48} />
                        </div>
                      )}
                      <div className="absolute top-4 right-4">
                        <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[8px] font-black uppercase tracking-widest text-emerald-500 border border-emerald-500/20">
                          {standard.category}
                        </span>
                      </div>
                    </div>
                    <div className="p-8">
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="text-xl font-bold tracking-tight">{standard.name}</h4>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setEditingStandard(standard);
                              setIsCreatingStandard(false);
                            }}
                            className="p-2 text-white/20 hover:text-white transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={() => deleteStandard(standard.id)}
                            className="p-2 text-white/20 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-white/30 leading-relaxed line-clamp-3 mb-6 font-medium italic">"{standard.prompt}"</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="p-3 bg-white/5 rounded-xl text-center">
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">Comp</p>
                          <p className="text-[10px] font-bold">{standard.rules.composition}</p>
                        </div>
                        <div className="p-3 bg-white/5 rounded-xl text-center">
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">Light</p>
                          <p className="text-[10px] font-bold">{standard.rules.lighting}</p>
                        </div>
                        <div className="p-3 bg-white/5 rounded-xl text-center">
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">Size</p>
                          <p className="text-[10px] font-bold">{standard.rules.size}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <button 
                  onClick={() => setIsImportingStandard(true)}
                  className="aspect-video border-2 border-dashed border-emerald-500/10 bg-emerald-500/5 rounded-[32px] text-emerald-500/40 font-bold hover:border-emerald-500/30 hover:text-emerald-500 transition-all flex flex-col items-center justify-center gap-4"
                >
                  <Sparkles size={32} />
                  <span className="uppercase tracking-[0.3em] text-xs">AI Smart Import</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Refine Modal */}
      <AnimatePresence>
        {refiningAsset && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#151515] w-full max-w-4xl rounded-[40px] border border-white/10 overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.5)]"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div className="bg-[#0D0D0D] aspect-square relative">
                  <img 
                    src={refiningAsset.url} 
                    className="w-full h-full object-contain p-8" 
                    alt="Refining" 
                    referrerPolicy="no-referrer"
                  />
                  {isRefining && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                      <Loader2 className="animate-spin text-emerald-500" size={40} />
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-white animate-pulse">Refining Asset...</p>
                    </div>
                  )}
                </div>
                <div className="p-12 flex flex-col justify-between">
                  <div className="space-y-8">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-3xl font-bold tracking-tight text-white">Refine Asset</h3>
                        <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mt-1">{refiningAsset.assetType}</p>
                      </div>
                      <button 
                        onClick={() => setRefiningAsset(null)}
                        className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">Refinement Instructions</label>
                      <textarea 
                        value={refinementPrompt}
                        onChange={(e) => setRefinementPrompt(e.target.value)}
                        placeholder="e.g. Make the metal more polished, adjust the lighting to be warmer, or fix the placement..."
                        className="w-full h-48 bg-white/5 border border-white/10 rounded-3xl p-6 text-sm focus:outline-none focus:border-emerald-500/50 transition-all resize-none"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 mt-8">
                    <button 
                      onClick={() => setRefiningAsset(null)}
                      className="flex-1 py-5 bg-white/5 text-white rounded-2xl font-bold text-sm hover:bg-white/10 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleRefineAsset}
                      disabled={isRefining || !refinementPrompt.trim()}
                      className="flex-[2] py-5 bg-emerald-500 text-black rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                      {isRefining ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                      <span>Execute Refinement</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* End of Main Content */}

      {/* Modal for Adding New Standard Type (Category) */}
      <AnimatePresence>
        {isAddingStandardType && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111111] w-full max-w-md rounded-[40px] p-10 border border-white/10 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-bold tracking-tighter">New Standard Category</h3>
                <button onClick={() => setIsAddingStandardType(false)} className="text-white/20 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Category Name</label>
                  <input 
                    type="text" 
                    value={newStandardTypeName}
                    onChange={(e) => setNewStandardTypeName(e.target.value)}
                    placeholder="e.g., Video, Model, Set" 
                    className="w-full bg-white/5 px-6 py-4 rounded-2xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold" 
                  />
                </div>

                <button 
                  onClick={() => {
                    if (newStandardTypeName.trim()) {
                      setStandardTypes([...standardTypes, newStandardTypeName.trim()]);
                      setActiveStandardType(newStandardTypeName.trim());
                      setNewStandardTypeName('');
                      setIsAddingStandardType(false);
                    }
                  }}
                  className="w-full py-4 bg-emerald-500 text-black rounded-2xl font-bold uppercase tracking-widest hover:bg-emerald-400 transition-all"
                >
                  Create Category
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for New Project (Workflow Redesign) */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-6 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#111111] w-full max-w-4xl rounded-[40px] p-12 border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] my-auto"
            >
              <div className="flex justify-between items-center mb-10">
                <div>
                  <h3 className="text-4xl font-bold tracking-tighter">Production Pipeline</h3>
                  <p className="text-white/40 text-sm mt-1">
                    Step {creationStep} of 3: {
                      creationStep === 1 ? 'Select Workflow' : 
                      creationStep === 2 ? `Configure ${newProjectData.workflow} Pipeline` : 
                      'Review & Start Production'
                    }
                  </p>
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3].map(s => (
                    <div key={s} className={`w-8 h-1 rounded-full transition-all ${creationStep >= s ? 'bg-emerald-500' : 'bg-white/10'}`} />
                  ))}
                </div>
              </div>
              
              {creationStep === 1 ? (
                <div className="grid grid-cols-2 gap-6 mb-10">
                  <button 
                    onClick={() => {
                      setNewProjectData({...newProjectData, workflow: 'Main'});
                      setCreationStep(2);
                    }}
                    className="p-8 bg-white/5 border border-white/5 rounded-[32px] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-left group"
                  >
                    <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <ImageIcon className="text-emerald-500" size={28} />
                    </div>
                    <h4 className="text-xl font-bold mb-2">Main Image Workflow</h4>
                    <p className="text-sm text-white/40 leading-relaxed">Generate high-fidelity master shots with multiple metal textures from 3D drawings.</p>
                  </button>

                  <button 
                    onClick={() => {
                      setNewProjectData({...newProjectData, workflow: 'Detail'});
                      setCreationStep(2);
                    }}
                    className="p-8 bg-white/5 border border-white/5 rounded-[32px] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-left group"
                  >
                    <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <FileText className="text-blue-500" size={28} />
                    </div>
                    <h4 className="text-xl font-bold mb-2">Detail Page Workflow</h4>
                    <p className="text-sm text-white/40 leading-relaxed">Create lifestyle scenes, model wear, and set combinations for product details.</p>
                  </button>

                  <button 
                    onClick={() => {
                      setNewProjectData({...newProjectData, workflow: 'Video'});
                      setCreationStep(2);
                    }}
                    className="p-8 bg-white/5 border border-white/5 rounded-[32px] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-left group"
                  >
                    <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <Video className="text-purple-500" size={28} />
                    </div>
                    <h4 className="text-xl font-bold mb-2">Video Workflow</h4>
                    <p className="text-sm text-white/40 leading-relaxed">Generate 360° spins and atmospheric cinematic videos for your products.</p>
                  </button>

                  <button 
                    onClick={() => {
                      setNewProjectData({...newProjectData, workflow: 'Ad'});
                      setCreationStep(2);
                    }}
                    className="p-8 bg-white/5 border border-white/5 rounded-[32px] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-left group"
                  >
                    <div className="w-14 h-14 bg-orange-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <Megaphone className="text-orange-500" size={28} />
                    </div>
                    <h4 className="text-xl font-bold mb-2">Ad Creative Workflow</h4>
                    <p className="text-sm text-white/40 leading-relaxed">Automate Google PMax and social media ad assets with brand consistency.</p>
                  </button>
                </div>
              ) : creationStep === 2 ? (
                <div className="space-y-8 mb-10">
                  {newProjectData.workflow === 'Main' && (
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div>
                          <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Batch SKUs (One per line)</label>
                          <textarea 
                            value={newProjectData.sku}
                            onChange={(e) => setNewProjectData({...newProjectData, sku: e.target.value})}
                            placeholder="SKU-001&#10;SKU-002&#10;SKU-003"
                            rows={4}
                            className="w-full bg-white/5 px-6 py-4 rounded-2xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-mono text-sm"
                          />
                        </div>

                        <div className="space-y-4">
                          <label className="block text-[10px] font-black mb-1 uppercase tracking-[0.2em] text-white/30">3-View Source Drawings</label>
                          <div className="grid grid-cols-2 gap-4">
                            {newProjectData.threeViewSources.map((src, idx) => (
                              <div key={idx} className="relative h-32 rounded-2xl overflow-hidden border border-white/10 group/img">
                                <img src={src} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNewProjectData(prev => ({
                                      ...prev,
                                      threeViewSources: prev.threeViewSources.filter((_, i) => i !== idx)
                                    }));
                                  }}
                                  className="absolute top-2 right-2 p-1.5 bg-black/60 backdrop-blur-md rounded-lg opacity-0 group-hover/img:opacity-100 hover:bg-red-500 transition-all"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                            <div 
                              onClick={() => document.getElementById('three-view-upload')?.click()}
                              className={`h-32 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group relative overflow-hidden ${
                                newProjectData.threeViewSources.length > 0 
                                  ? 'border-white/10 hover:border-emerald-500/30 bg-white/5' 
                                  : 'border-emerald-500/50 bg-emerald-500/5 h-64'
                              }`}
                            >
                              <input 
                                id="three-view-upload"
                                type="file" 
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={handleFileChange}
                              />
                              {isAnalyzing ? (
                                <div className="flex flex-col items-center gap-2">
                                  <Loader2 className="animate-spin text-emerald-500" size={24} />
                                  <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest">AI Extracting...</span>
                                </div>
                              ) : (
                                <>
                                  <Plus className="text-white/20 group-hover:text-emerald-500 transition-colors" size={newProjectData.threeViewSources.length > 0 ? 20 : 32} />
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                                    {newProjectData.threeViewSources.length > 0 ? 'Add More' : 'Upload 3D Drawings (Multi-View)'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div>
                          <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Category</label>
                          <select 
                            value={newProjectData.category}
                            onChange={(e) => setNewProjectData({...newProjectData, category: e.target.value as any})}
                            className="w-full bg-white/5 px-4 py-3 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold appearance-none text-white"
                          >
                            <option value="Ring" className="bg-[#111]">Ring</option>
                            <option value="necklace" className="bg-[#111]">Necklace</option>
                            <option value="necklace with pendant" className="bg-[#111]">Necklace with Pendant</option>
                            <option value="charms & pendants" className="bg-[#111]">Charms & Pendants</option>
                            <option value="earrings" className="bg-[#111]">Earrings</option>
                            <option value="bracelet" className="bg-[#111]">Bracelet</option>
                            <option value="hand chain" className="bg-[#111]">Hand Chain</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Target Metal</label>
                          <div className="grid grid-cols-2 gap-2">
                            {standards.filter(s => s.type === 'Metal').map(metal => (
                              <button
                                key={metal.id}
                                type="button"
                                onClick={() => setNewProjectData({...newProjectData, metalId: metal.id})}
                                className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all flex items-center justify-between ${
                                  newProjectData.metalId === metal.id
                                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
                                    : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                }`}
                              >
                                {metal.name?.split(' ')[0] || 'Metal'}
                                {newProjectData.metalId === metal.id && <Check size={12} />}
                              </button>
                            ))}
                          </div>
                        </div>

                        {newProjectData.workflow !== 'Main' && (
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Material</label>
                              <input 
                                type="text" 
                                value={newProjectData.material}
                                onChange={(e) => setNewProjectData({...newProjectData, material: e.target.value})}
                                placeholder="S925" 
                                className="w-full bg-white/5 px-4 py-3 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold" 
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Weight (g)</label>
                              <input 
                                type="text" 
                                value={newProjectData.weight}
                                onChange={(e) => setNewProjectData({...newProjectData, weight: e.target.value})}
                                placeholder="2.4g" 
                                className="w-full bg-white/5 px-4 py-3 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold" 
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Size</label>
                              <input 
                                type="text" 
                                value={newProjectData.size}
                                onChange={(e) => setNewProjectData({...newProjectData, size: e.target.value})}
                                placeholder="e.g., 15mm" 
                                className="w-full bg-white/5 px-4 py-3 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold" 
                              />
                            </div>
                          </div>
                        )}

                        {newProjectData.workflow !== 'Main' && (
                          <div>
                            <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Standards</label>
                            <div className="space-y-3">
                              <select 
                                value={newProjectData.standardId}
                                onChange={(e) => setNewProjectData({...newProjectData, standardId: e.target.value})}
                                className="w-full bg-white/5 px-4 py-3 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold appearance-none text-white"
                              >
                                <option value="" className="bg-[#111]">Main Standard: Auto-match</option>
                                {standards.filter(s => s.type === 'Main').map(s => <option key={s.id} value={s.id} className="bg-[#111]">{s.name}</option>)}
                              </select>
                              <select 
                                value={newProjectData.placeholderId}
                                onChange={(e) => setNewProjectData({...newProjectData, placeholderId: e.target.value})}
                                className="w-full bg-white/5 px-4 py-3 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold appearance-none text-white"
                              >
                                <option value="" className="bg-[#111]">Alignment: Auto-match</option>
                                {standards.filter(s => s.type === 'Placeholder').map(s => <option key={s.id} value={s.id} className="bg-[#111]">{s.name}</option>)}
                              </select>
                            </div>
                          </div>
                        )}

                        {newProjectData.workflow !== 'Main' && (
                          <div>
                            <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Notes</label>
                            <textarea 
                              value={newProjectData.notes}
                              onChange={(e) => setNewProjectData({...newProjectData, notes: e.target.value})}
                              placeholder="Additional details..." 
                              className="w-full bg-white/5 px-4 py-3 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold h-24 resize-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {newProjectData.workflow === 'Detail' && (
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div>
                          <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Main Item (Required)</label>
                          <div className="flex gap-4">
                            <div 
                              onClick={() => {
                                setLibraryTarget('mainItem');
                                setIsLibraryOpen(true);
                              }}
                              className={`flex-1 h-40 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all overflow-hidden ${
                                newProjectData.mainItem 
                                  ? 'border-emerald-500/50 bg-emerald-500/5' 
                                  : 'border-white/10 hover:border-emerald-500/30 bg-white/5'
                              }`}
                            >
                              {newProjectData.mainItem ? (
                                <img src={newProjectData.mainItem} className="w-full h-full object-cover" />
                              ) : (
                                <>
                                  <FolderOpen className="text-white/20" size={24} />
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Select from Library</span>
                                </>
                              )}
                            </div>
                            <div 
                              onClick={() => document.getElementById('main-item-upload')?.click()}
                              className="w-24 h-40 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-emerald-500/30 bg-white/5 transition-all"
                            >
                              <input 
                                id="main-item-upload"
                                type="file" 
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => setNewProjectData({...newProjectData, mainItem: ev.target?.result as string});
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                              <Plus className="text-white/20" size={20} />
                              <span className="text-[8px] font-bold uppercase tracking-widest text-white/40">Upload</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Matching Item (Optional)</label>
                          <div className="flex gap-4">
                            <div 
                              onClick={() => {
                                setLibraryTarget('matchingItem');
                                setIsLibraryOpen(true);
                              }}
                              className={`flex-1 h-40 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all overflow-hidden ${
                                newProjectData.matchingItem 
                                  ? 'border-blue-500/50 bg-blue-500/5' 
                                  : 'border-white/10 hover:border-blue-500/30 bg-white/5'
                              }`}
                            >
                              {newProjectData.matchingItem ? (
                                <img src={newProjectData.matchingItem} className="w-full h-full object-cover" />
                              ) : (
                                <>
                                  <FolderOpen className="text-white/20" size={24} />
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Select from Library</span>
                                </>
                              )}
                            </div>
                            <div 
                              onClick={() => document.getElementById('matching-item-upload')?.click()}
                              className="w-24 h-40 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-500/30 bg-white/5 transition-all"
                            >
                              <input 
                                id="matching-item-upload"
                                type="file" 
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => setNewProjectData({...newProjectData, matchingItem: ev.target?.result as string});
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                              <Plus className="text-white/20" size={20} />
                              <span className="text-[8px] font-bold uppercase tracking-widest text-white/40">Upload</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div>
                          <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Image Types to Generate</label>
                          <div className="grid grid-cols-1 gap-2">
                            {[
                              'Main Item Scene',
                              'Main Item Model Wear',
                              'Main Item Detail Shot',
                              ...(newProjectData.matchingItem ? ['Set Scene', 'Set Model Wear'] : [])
                            ].map(type => (
                              <button
                                key={type}
                                onClick={() => {
                                  const current = newProjectData.detailTypes;
                                  if (current.includes(type)) {
                                    setNewProjectData({...newProjectData, detailTypes: current.filter(t => t !== type)});
                                  } else {
                                    setNewProjectData({...newProjectData, detailTypes: [...current, type]});
                                  }
                                }}
                                className={`p-4 rounded-2xl border transition-all text-left flex items-center justify-between ${
                                  newProjectData.detailTypes.includes(type)
                                    ? 'bg-blue-500/10 border-blue-500 text-blue-500'
                                    : 'bg-white/5 border-white/5 text-white/40 hover:border-white/20'
                                }`}
                              >
                                <span className="text-xs font-bold">{type}</span>
                                {newProjectData.detailTypes.includes(type) && <Check size={14} />}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">SKU</label>
                            <input 
                              type="text" 
                              value={newProjectData.sku}
                              onChange={(e) => setNewProjectData({...newProjectData, sku: e.target.value})}
                              placeholder="SKU-DETAIL" 
                              className="w-full bg-white/5 px-4 py-3 rounded-xl border border-white/5 focus:outline-none focus:border-blue-500/50 transition-all font-bold" 
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Category</label>
                              <select 
                                value={newProjectData.category}
                                onChange={(e) => setNewProjectData({...newProjectData, category: e.target.value as any})}
                                className="w-full bg-white/5 px-4 py-3 rounded-xl border border-white/5 focus:outline-none focus:border-blue-500/50 transition-all font-bold appearance-none text-white"
                              >
                                <option value="Ring" className="bg-[#111]">Ring</option>
                                <option value="necklace" className="bg-[#111]">Necklace</option>
                                <option value="necklace with pendant" className="bg-[#111]">Necklace with Pendant</option>
                                <option value="charms & pendants" className="bg-[#111]">Charms & Pendants</option>
                                <option value="earrings" className="bg-[#111]">Earrings</option>
                                <option value="bracelet" className="bg-[#111]">Bracelet</option>
                                <option value="hand chain" className="bg-[#111]">Hand Chain</option>
                              </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(newProjectData.workflow === 'Video' || newProjectData.workflow === 'Ad') && (
                    <div className="h-64 flex flex-col items-center justify-center text-center bg-white/5 rounded-[32px] border border-dashed border-white/10">
                      <Sparkles className="text-white/20 mb-4" size={48} />
                      <h4 className="text-xl font-bold mb-2">{newProjectData.workflow} Workflow Coming Soon</h4>
                      <p className="text-sm text-white/40">We are currently optimizing the AI engine for this production pipeline.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-8 mb-10">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                      <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-4">Workflow</p>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                          {newProjectData.workflow === 'Main' && <ImageIcon className="text-emerald-500" size={20} />}
                          {newProjectData.workflow === 'Detail' && <FileText className="text-blue-500" size={20} />}
                          {newProjectData.workflow === 'Video' && <Video className="text-purple-500" size={20} />}
                          {newProjectData.workflow === 'Ad' && <Megaphone className="text-orange-500" size={20} />}
                        </div>
                        <span className="font-bold">{newProjectData.workflow} Pipeline</span>
                      </div>
                    </div>
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                      <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-4">Product SKU</p>
                      <span className="text-xl font-bold tracking-tight">{newProjectData.sku || 'AUTO-GENERATE'}</span>
                    </div>
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                      <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-4">Category</p>
                      <span className="font-bold">{newProjectData.category}</span>
                    </div>
                  </div>

                  <div className="p-8 bg-emerald-500/5 border border-emerald-500/20 rounded-[32px]">
                    <h4 className="text-sm font-bold text-emerald-500 uppercase tracking-widest mb-4">Production Summary</h4>
                    <ul className="space-y-3 text-sm text-white/60">
                      {newProjectData.workflow === 'Main' && (
                        <>
                          <li className="flex justify-between">
                            <span>Target Metal:</span>
                            <span className="text-white font-bold">{standards.find(s => s.id === newProjectData.metalId)?.name || 'None'}</span>
                          </li>
                          <li className="flex justify-between">
                            <span>Source Drawing:</span>
                            <span className="text-emerald-500 font-bold">Imported</span>
                          </li>
                        </>
                      )}
                      {newProjectData.workflow === 'Detail' && (
                        <>
                          <li className="flex justify-between">
                            <span>Assets to Generate:</span>
                            <span className="text-white font-bold">{newProjectData.detailTypes.length} Images</span>
                          </li>
                          <li className="flex justify-between">
                            <span>Main Item:</span>
                            <span className={newProjectData.mainItem ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                              {newProjectData.mainItem ? 'Selected' : 'Missing'}
                            </span>
                          </li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    if (creationStep === 1) setIsCreating(false);
                    else setCreationStep(creationStep - 1);
                  }} 
                  className="flex-1 py-5 bg-white/5 text-white rounded-2xl font-bold hover:bg-white/10 transition-colors"
                >
                  {creationStep === 1 ? 'Discard' : 'Back'}
                </button>
                <button 
                  disabled={
                    (creationStep === 2 && newProjectData.workflow === 'Main' && newProjectData.threeViewSources.length === 0) ||
                    (creationStep === 2 && newProjectData.workflow === 'Detail' && !newProjectData.mainItem) ||
                    (creationStep === 2 && (newProjectData.workflow === 'Video' || newProjectData.workflow === 'Ad'))
                  }
                  onClick={() => {
                    if (creationStep < 3) {
                      setCreationStep(creationStep + 1);
                    } else {
                      createProject();
                    }
                  }}
                  className={`flex-1 py-5 rounded-2xl font-bold transition-all ${
                    (creationStep === 2 && newProjectData.workflow === 'Main' && newProjectData.threeViewSources.length === 0) ||
                    (creationStep === 2 && newProjectData.workflow === 'Detail' && !newProjectData.mainItem) ||
                    (creationStep === 2 && (newProjectData.workflow === 'Video' || newProjectData.workflow === 'Ad'))
                      ? 'bg-white/5 text-white/20 cursor-not-allowed' 
                      : 'bg-emerald-500 text-black hover:scale-[1.02]'
                  }`}
                >
                  {creationStep === 3 ? 'Start Production' : 'Continue'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Library Selector Modal */}
      <AnimatePresence>
        {isLibraryOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] w-full max-w-5xl rounded-[40px] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-10 border-b border-white/5 flex justify-between items-center">
                <div>
                  <h3 className="text-3xl font-bold tracking-tighter">Asset Library</h3>
                  <p className="text-white/40 text-sm mt-1">Select a previously generated main image for your detail page.</p>
                </div>
                <button onClick={() => setIsLibraryOpen(false)} className="p-3 hover:bg-white/5 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-10 grid grid-cols-4 gap-6 custom-scrollbar">
                {productRegistry.map(product => (
                  <button
                    key={product.sku}
                    onClick={() => {
                      if (libraryTarget) {
                        setNewProjectData({
                          ...newProjectData, 
                          [libraryTarget]: product.mainImage || (product.mainImages && product.mainImages.find(i => i.url !== 'FAILED')?.url) || '',
                          sku: product.sku,
                          category: product.category,
                          material: product.specs.material,
                          weight: product.specs.weight,
                          size: product.specs.size,
                          notes: product.specs.notes || ''
                        });
                      }
                      setIsLibraryOpen(false);
                    }}
                    className="group relative aspect-square rounded-3xl overflow-hidden border border-white/5 hover:border-emerald-500/50 transition-all"
                  >
                    {product.mainImages && product.mainImages.length > 0 ? (
                      product.mainImages.find(i => i.url !== 'FAILED') ? (
                        <img src={product.mainImages.find(i => i.url !== 'FAILED')!.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-red-500/50 bg-[#111]">
                          <AlertCircle size={24} />
                        </div>
                      )
                    ) : product.mainImage ? (
                      <img src={product.mainImage} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/5">
                        <ImageIcon size={48} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                      <p className="text-xs font-bold text-white mb-1">{product.sku}</p>
                      <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">{product.specs.material}</p>
                    </div>
                  </button>
                ))}
                {productRegistry.length === 0 && (
                  <div className="col-span-4 py-20 text-center text-white/20">
                    <ImageIcon className="mx-auto mb-4 opacity-10" size={64} />
                    <p className="text-lg font-bold uppercase tracking-widest">No Products Found</p>
                    <p className="text-sm mt-2">Generate main images first to populate the library.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Asset Modal */}
      <AnimatePresence>
        {isAddingAsset && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingAsset(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-[#0D0D0D] rounded-[40px] border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-10">
                <div className="flex justify-between items-center mb-10">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tighter">Add Custom Asset</h2>
                    <p className="text-xs text-white/40 uppercase tracking-widest mt-1">Select a standard to derive a new image</p>
                  </div>
                  <button onClick={() => setIsAddingAsset(false)} className="p-3 hover:bg-white/5 rounded-full transition-colors">
                    <X size={24} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {standards.filter(s => s.type === 'Scene' || s.type === 'Model').map(std => (
                    <button
                      key={std.id}
                      onClick={() => {
                        if (selectedProjectId) handleDeriveSingleAsset(selectedProjectId, std.id);
                        setIsAddingAsset(false);
                      }}
                      className="p-6 bg-white/5 rounded-3xl border border-white/5 hover:border-emerald-500/50 transition-all text-left group"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{std.type}</span>
                        <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-black transition-colors">
                          <Plus size={14} />
                        </div>
                      </div>
                      <h4 className="font-bold text-sm mb-1">{std.name}</h4>
                      <p className="text-[10px] text-white/20 uppercase tracking-widest">{std.category} • {std.metal}</p>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for Standard Management */}
      <AnimatePresence>
        {(isCreatingStandard || editingStandard) && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#111111] w-full max-w-2xl rounded-[40px] p-12 border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)]"
            >
              <h3 className="text-4xl font-bold tracking-tighter mb-10">
                {editingStandard ? 'Edit Standard' : 'New Technical Standard'}
              </h3>
              
              <div className="grid grid-cols-2 gap-8 mb-10">
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Standard Name</label>
                    <input id="std-name" type="text" defaultValue={editingStandard?.name} placeholder="e.g., Luxury Gold Ring" className="w-full bg-white/5 px-6 py-4 rounded-2xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Type</label>
                      <select 
                        id="std-type" 
                        defaultValue={editingStandard?.type || activeStandardType} 
                        onChange={(e) => {
                          const newType = e.target.value;
                          setModalType(newType);
                          if (editingStandard) {
                            setEditingStandard({ ...editingStandard, type: newType });
                          }
                        }}
                        className="w-full bg-white/5 px-4 py-3 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold appearance-none text-white"
                      >
                        {standardTypes.map(type => (
                          <option key={type} value={type} className="bg-[#111]">{type}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Business Category</label>
                      <select 
                        id="std-category" 
                        defaultValue={editingStandard?.category || 'All'} 
                        className="w-full bg-white/5 px-4 py-3 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold appearance-none text-white"
                      >
                        <option value="All" className="bg-[#111]">All Categories</option>
                        <option value="Ring" className="bg-[#111]">Ring</option>
                        <option value="necklace" className="bg-[#111]">Necklace</option>
                        <option value="necklace with pendant" className="bg-[#111]">Necklace with Pendant</option>
                        <option value="charms & pendants" className="bg-[#111]">Charms & Pendants</option>
                        <option value="earrings" className="bg-[#111]">Earrings</option>
                        <option value="bracelet" className="bg-[#111]">Bracelet</option>
                        <option value="hand chain" className="bg-[#111]">Hand Chain</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Sub-Category</label>
                      <input id="std-subcategory" type="text" defaultValue={editingStandard?.subCategory} placeholder="e.g. Wide Band, Thin Band, Vertical" className="w-full bg-white/5 px-4 py-3 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold appearance-none text-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Stone</label>
                      <select id="std-stone" defaultValue={editingStandard?.stone || 'All'} className="w-full bg-white/5 px-4 py-3 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold appearance-none text-white">
                        <option value="All" className="bg-[#111]">All Stones</option>
                        <option value="Diamond" className="bg-[#111]">Diamond</option>
                        <option value="Sapphire" className="bg-[#111]">Sapphire</option>
                        <option value="Ruby" className="bg-[#111]">Ruby</option>
                        <option value="Emerald" className="bg-[#111]">Emerald</option>
                      </select>
                    </div>
                  </div>

                  {/* Component Inheritance */}
                  {modalType !== 'Component' && (
                    <div className="space-y-3">
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Inherit Components</label>
                      <div className="flex flex-wrap gap-2">
                        {standards.filter(s => s.type === 'Component' && s.id !== editingStandard?.id).map(comp => (
                          <button
                            key={comp.id}
                            onClick={() => {
                              if (editingStandard) {
                                const currentIds = editingStandard.componentIds || [];
                                const newIds = currentIds.includes(comp.id)
                                  ? currentIds.filter(id => id !== comp.id)
                                  : [...currentIds, comp.id];
                                setEditingStandard({ ...editingStandard, componentIds: newIds });
                              }
                            }}
                            className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                              (editingStandard?.componentIds || []).includes(comp.id)
                                ? 'bg-emerald-500 text-black'
                                : 'bg-white/5 text-white/40 hover:bg-white/10'
                            }`}
                          >
                            {comp.name}
                          </button>
                        ))}
                        {standards.filter(s => s.type === 'Component' && s.id !== editingStandard?.id).length === 0 && (
                          <p className="text-[10px] text-white/20 italic">No component standards defined yet.</p>
                        )}
                      </div>
                    </div>
                  )}
                  {(modalType === 'Main' || modalType === 'Metal') && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Metal</label>
                        <select id="std-metal" defaultValue={editingStandard?.metal} className="w-full bg-white/5 px-4 py-3 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold appearance-none text-white">
                          <option value="All" className="bg-[#111]">All Metals</option>
                          <option value="Silver" className="bg-[#111]">Silver</option>
                          <option value="Gold Vermeil" className="bg-[#111]">Gold Vermeil</option>
                          <option value="14k Gold" className="bg-[#111]">14k Gold</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Background Color</label>
                        <input id="std-bg" type="color" defaultValue={editingStandard?.backgroundColor || '#FFFFFF'} className="w-full h-[46px] bg-white/5 px-2 py-2 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all cursor-pointer" />
                      </div>
                    </div>
                  )}

                  {modalType === 'VI' && (
                    <div className="space-y-6 pt-4 border-t border-white/5">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Primary Color</label>
                          <input id="std-primary-color" type="color" defaultValue={editingStandard?.primaryColor || '#10B981'} className="w-full h-[46px] bg-white/5 px-2 py-2 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all cursor-pointer" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Secondary Color</label>
                          <input id="std-secondary-color" type="color" defaultValue={editingStandard?.secondaryColor || '#111111'} className="w-full h-[46px] bg-white/5 px-2 py-2 rounded-xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all cursor-pointer" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Font Family</label>
                        <input id="std-font" type="text" defaultValue={editingStandard?.fontFamily || 'Inter'} placeholder="e.g., Inter, Playfair Display" className="w-full bg-white/5 px-6 py-4 rounded-2xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold" />
                      </div>
                    </div>
                  )}

                  {modalType === 'AD' && (
                    <div className="space-y-6 pt-4 border-t border-white/5">
                      <div>
                        <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Business Name</label>
                        <input id="std-business-name" type="text" defaultValue={editingStandard?.businessName} placeholder="e.g., JewelryAI" className="w-full bg-white/5 px-6 py-4 rounded-2xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Headlines (Comma separated)</label>
                        <textarea id="std-headlines" defaultValue={editingStandard?.headlines?.join(', ')} rows={2} placeholder="Luxury Jewelry, Handcrafted Elegance..." className="w-full bg-white/5 px-6 py-4 rounded-2xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold text-sm resize-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Long Headlines (Comma separated)</label>
                        <textarea id="std-long-headlines" defaultValue={editingStandard?.longHeadlines?.join(', ')} rows={2} placeholder="Discover the Art of Fine Jewelry Craftsmanship..." className="w-full bg-white/5 px-6 py-4 rounded-2xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold text-sm resize-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Descriptions (Comma separated)</label>
                        <textarea id="std-descriptions" defaultValue={editingStandard?.descriptions?.join(', ')} rows={2} placeholder="Our handcrafted pieces are designed to last a lifetime..." className="w-full bg-white/5 px-6 py-4 rounded-2xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold text-sm resize-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Call to Action</label>
                        <input id="std-cta" type="text" defaultValue={editingStandard?.callToAction} placeholder="e.g., Shop Now" className="w-full bg-white/5 px-6 py-4 rounded-2xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  {modalType !== 'Main' ? (
                    <div>
                      <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">
                        {modalType === 'Placeholder' ? 'Positioning & Alignment Prompt' : 'AI Prompt Template'}
                      </label>
                      <textarea 
                        id="std-prompt" 
                        defaultValue={editingStandard?.prompt} 
                        rows={4} 
                        placeholder={modalType === 'Placeholder' ? "Describe how the product should align with the reference image (e.g., 'Centered at 45 degree angle, matching the reference silhouette')" : "e.g., Luxury jewelry on marble surface..."}
                        className="w-full bg-white/5 px-6 py-4 rounded-2xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold text-sm resize-none" 
                      />
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center p-8 border border-white/5 rounded-3xl bg-white/5">
                      <div className="text-center">
                        <div className="w-16 h-16 rounded-full mx-auto mb-4 border border-white/10 flex items-center justify-center shadow-2xl" style={{ backgroundColor: editingStandard?.backgroundColor || '#FFFFFF' }}>
                          <div className="w-8 h-8 rounded-full border border-black/10" />
                        </div>
                        <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Main Image Mode</p>
                        <p className="text-[10px] text-white/20 mt-2">Background color only. No prompt required.</p>
                      </div>
                    </div>
                  )}
                  {modalType !== 'Main' && (
                    <div>
                      <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">
                        {modalType === 'Placeholder' ? 'Positioning Reference (1.png)' : 'Reference Image(s)'}
                      </label>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        {(editingStandard?.referenceImages || (editingStandard?.referenceImage ? [editingStandard.referenceImage] : [])).map((img, idx) => (
                          <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 group">
                            <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (editingStandard) {
                                  const currentImages = editingStandard.referenceImages || (editingStandard.referenceImage ? [editingStandard.referenceImage] : []);
                                  const newImages = currentImages.filter((_, i) => i !== idx);
                                  setEditingStandard({
                                    ...editingStandard,
                                    referenceImages: newImages,
                                    referenceImage: newImages[0] || ''
                                  });
                                }
                              }}
                              className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                        <div 
                          onClick={() => document.getElementById('std-ref-upload')?.click()}
                          className="aspect-square border border-dashed border-white/10 rounded-xl bg-white/5 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500/30 transition-all"
                        >
                          <Plus size={16} className="text-white/20" />
                          <input 
                            id="std-ref-upload" 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                  const base64 = ev.target?.result as string;
                                  if (editingStandard) {
                                    const currentImages = editingStandard.referenceImages || (editingStandard.referenceImage ? [editingStandard.referenceImage] : []);
                                    setEditingStandard({
                                      ...editingStandard,
                                      referenceImages: [...currentImages, base64],
                                      referenceImage: base64
                                    });
                                  }
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-4">
                <button onClick={() => { setIsCreatingStandard(false); setEditingStandard(null); }} className="flex-1 py-5 bg-white/5 text-white rounded-2xl font-bold hover:bg-white/10 transition-colors">Cancel</button>
                <button 
                  onClick={() => {
                    const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value;
                    
                    const name = getVal('std-name');
                    const type = getVal('std-type') as any;
                    const category = getVal('std-category') as any;
                    const subCategory = getVal('std-subcategory');
                    const prompt = getVal('std-prompt') || '';
                    
                    if (!name) {
                      showToast("Please enter a name for the standard.", "error");
                      return;
                    }

                    if (!type) {
                      showToast("Type is required.", "error");
                      return;
                    }

                    try {
                      // Get values from DOM if they exist, otherwise fallback to editingStandard or defaults
                      const metal = getVal('std-metal') as any || editingStandard?.metal || 'All';
                      const stone = getVal('std-stone') as any || editingStandard?.stone || 'All';
                      const backgroundColor = getVal('std-bg') || editingStandard?.backgroundColor || '#FAFAFA';
                      
                      // Get all reference images from state
                      const referenceImages = editingStandard?.referenceImages || [];
                      const primaryImage = referenceImages[0] || editingStandard?.referenceImage || '';
                      
                      const stdData: any = {
                        name, 
                        type, 
                        category, 
                        subCategory, 
                        metal, 
                        stone, 
                        prompt, 
                        backgroundColor, 
                        referenceImage: primaryImage,
                        referenceImages: referenceImages,
                        componentIds: editingStandard?.componentIds || [],
                        rules: editingStandard?.rules || { composition: 'Standard', lighting: 'Studio', size: '2000x2000' }
                      };

                      // VI Fields - only if modalType is VI
                      if (modalType === 'VI') {
                        stdData.primaryColor = getVal('std-primary-color') || editingStandard?.primaryColor;
                        stdData.secondaryColor = getVal('std-secondary-color') || editingStandard?.secondaryColor;
                        stdData.fontFamily = getVal('std-font') || editingStandard?.fontFamily;
                      } else {
                        // Preserve existing VI data if we're just switching views but not changing type
                        if (editingStandard?.type === 'VI') {
                          stdData.primaryColor = editingStandard.primaryColor;
                          stdData.secondaryColor = editingStandard.secondaryColor;
                          stdData.fontFamily = editingStandard.fontFamily;
                        }
                      }

                      // AD Fields - only if modalType is AD
                      if (modalType === 'AD') {
                        stdData.businessName = getVal('std-business-name') || editingStandard?.businessName;
                        
                        const hStr = getVal('std-headlines');
                        stdData.headlines = hStr ? hStr.split(',').map(s => s.trim()).filter(Boolean) : editingStandard?.headlines;
                        
                        const lhStr = getVal('std-long-headlines');
                        stdData.longHeadlines = lhStr ? lhStr.split(',').map(s => s.trim()).filter(Boolean) : editingStandard?.longHeadlines;
                        
                        const dStr = getVal('std-descriptions');
                        stdData.descriptions = dStr ? dStr.split(',').map(s => s.trim()).filter(Boolean) : editingStandard?.descriptions;
                        
                        stdData.callToAction = getVal('std-cta') || editingStandard?.callToAction;
                      } else {
                        // Preserve existing AD data
                        if (editingStandard?.type === 'AD') {
                          stdData.businessName = editingStandard.businessName;
                          stdData.headlines = editingStandard.headlines;
                          stdData.longHeadlines = editingStandard.longHeadlines;
                          stdData.descriptions = editingStandard.descriptions;
                          stdData.callToAction = editingStandard.callToAction;
                        }
                      }

                      // Check if we are updating an existing standard or creating a new one
                      const isExisting = standards.some(s => s.id === editingStandard?.id);
                      if (isExisting && editingStandard) {
                        updateStandard({ ...stdData, id: editingStandard.id });
                      } else {
                        addStandard({ ...stdData, id: editingStandard?.id || `std-${Date.now()}` });
                      }
                      
                      setIsCreatingStandard(false);
                      setEditingStandard(null);
                    } catch (error) {
                      console.error("Error saving standard:", error);
                      showToast("Failed to save standard.", "error");
                    }
                  }}
                  className="flex-1 py-5 bg-emerald-500 text-black rounded-2xl font-bold hover:scale-[1.02] transition-all"
                >
                  {isCreatingStandard ? 'Create Standard' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Modal for Smart Standard Import */}
      <AnimatePresence>
        {isImportingStandard && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111111] w-full max-w-xl rounded-[40px] p-12 border border-white/10 shadow-2xl"
            >
              <div className="text-center mb-10">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center border border-emerald-500/20 mx-auto mb-6">
                  <Sparkles className="text-emerald-500" size={40} />
                </div>
                <h3 className="text-3xl font-bold tracking-tighter mb-2">
                  {refiningStandardId ? `Refine "${standards.find(s => s.id === refiningStandardId)?.name}"` : 'Smart Standard Import'}
                </h3>
                <p className="text-white/40 text-sm">
                  {refiningStandardId 
                    ? 'Upload a new reference image to enhance the existing prompt and visual style of this standard.' 
                    : 'Upload a reference image (style guide, color palette, or placeholder) and AI will generate a technical standard.'}
                </p>
              </div>

              {!refiningStandardId && standards.length > 0 && (
                <div className="mb-8">
                  <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3 block">Or Refine Existing Standard</label>
                  <select 
                    onChange={(e) => setRefiningStandardId(e.target.value || null)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                  >
                    <option value="">-- Create New Standard --</option>
                    {standards.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
                    ))}
                  </select>
                </div>
              )}

              <div 
                onClick={() => document.getElementById('std-import-upload')?.click()}
                className="h-60 border-2 border-dashed border-white/10 rounded-[32px] bg-white/5 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-emerald-500/30 transition-all group"
              >
                <input 
                  id="std-import-upload"
                  type="file" 
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        if (ev.target?.result) {
                          handleImportStandard(ev.target.result as string);
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                {isAnalyzingStandard ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-emerald-500" size={40} />
                    <span className="text-xs font-bold text-emerald-500 uppercase tracking-[0.2em]">Analyzing Reference...</span>
                  </div>
                ) : (
                  <>
                    <ImageIcon className="text-white/20 group-hover:text-emerald-500 transition-colors" size={48} />
                    <span className="text-xs font-bold text-white/20 uppercase tracking-widest">Select Reference Image</span>
                  </>
                )}
              </div>

              <button 
                onClick={() => {
                  setIsImportingStandard(false);
                  setRefiningStandardId(null);
                }}
                className="w-full mt-8 py-5 bg-white/5 text-white rounded-2xl font-bold hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for Image Refinement */}
      <AnimatePresence>
        {refiningAsset && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] w-full max-w-5xl rounded-[40px] overflow-hidden border border-white/10 shadow-2xl flex h-[80vh]"
            >
              <div className="w-2/3 bg-black flex flex-col items-center justify-center p-12 border-r border-white/5 relative">
                <div className="relative w-full h-full">
                  <img src={refiningAsset.url} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  
                  {/* The Reference Overlay (1.png) */}
                  <AnimatePresence>
                    {showOverlay && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: overlayOpacity }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 pointer-events-none"
                      >
                        {(() => {
                          const project = projects.find(p => p.id === refiningAsset.projectId);
                          const standard = standards.find(s => s.id === project?.standardId);
                          return standard?.referenceImage ? (
                            <img 
                              src={standard.referenceImage} 
                              alt="Overlay Reference" 
                              className="w-full h-full object-contain mix-blend-screen"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
                              No Reference Image for this Standard
                            </div>
                          );
                        })()}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {isRefining && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-10">
                      <Loader2 className="animate-spin text-emerald-500" size={48} />
                      <span className="text-xs font-bold text-emerald-500 uppercase tracking-[0.3em]">AI Refining Texture...</span>
                    </div>
                  )}
                </div>

                {/* Overlay Controls */}
                <div className="absolute bottom-12 left-12 right-12 flex items-center gap-6 bg-black/60 backdrop-blur-xl p-6 rounded-[32px] border border-white/10">
                  <button 
                    onClick={() => setShowOverlay(!showOverlay)}
                    className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-bold transition-all ${showOverlay ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white/40 hover:text-white'}`}
                  >
                    <Layers size={18} />
                    <span className="text-[10px] uppercase tracking-widest">{showOverlay ? 'Overlay Active' : 'Show Overlay'}</span>
                  </button>
                  
                  {showOverlay && (
                    <div className="flex-1 flex items-center gap-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Opacity</span>
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.01" 
                        value={overlayOpacity}
                        onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                        className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                      <span className="text-[10px] font-mono text-emerald-500 w-10">{Math.round(overlayOpacity * 100)}%</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="w-1/3 p-12 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-emerald-500 mb-6">
                    <Sparkles size={16} />
                    <span className="text-[10px] font-black uppercase tracking-widest">AI Refinement Engine</span>
                  </div>
                  <h3 className="text-3xl font-bold tracking-tighter mb-4">Fine-tune Asset</h3>
                  <p className="text-white/30 text-xs leading-relaxed mb-8">
                    Describe the adjustments you'd like to make. The AI will maintain the core structure while optimizing textures, lighting, or specific details.
                  </p>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-white/30">Refinement Prompt</label>
                      <textarea 
                        value={refinementPrompt}
                        onChange={(e) => setRefinementPrompt(e.target.value)}
                        placeholder="e.g., Make the gold more vibrant, increase diamond fire, or soften the shadows..." 
                        className="w-full bg-white/5 px-6 py-4 rounded-2xl border border-white/5 focus:outline-none focus:border-emerald-500/50 transition-all font-bold text-sm h-40 resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <button 
                    disabled={isRefining || !refinementPrompt}
                    onClick={handleRefineAsset}
                    className={`w-full py-5 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all ${
                      isRefining || !refinementPrompt ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-emerald-500 text-black hover:scale-[1.02]'
                    }`}
                  >
                    {isRefining ? 'Processing...' : 'Apply Refinement'}
                  </button>
                  <button 
                    onClick={() => setRefiningAsset(null)}
                    className="w-full py-5 bg-white/5 text-white rounded-2xl font-bold hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* API Key Settings Modal */}
      <AnimatePresence>
        {isSettingKey && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingKey(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-[#111] border border-white/10 rounded-3xl p-8 overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold tracking-tight mb-1">API Configuration</h3>
                  <p className="text-xs text-white/40 uppercase tracking-widest font-bold">Local Environment Settings</p>
                </div>
                <button 
                  onClick={() => setIsSettingKey(false)}
                  className="p-2 hover:bg-white/5 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                  <div className="flex items-start gap-3">
                    <Key className="text-emerald-500 mt-1" size={18} />
                    <div>
                      <p className="text-sm font-medium text-emerald-500 mb-1">Gemini API Key</p>
                      <p className="text-[10px] text-white/40 leading-relaxed">
                        Enter your Google Gemini API Key. This key will be saved locally in your browser and used for image and video generation.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-1">
                    API Key
                  </label>
                  <input 
                    type="password"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="Enter your API Key here..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setIsSettingKey(false)}
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveCustomKey}
                    className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-2xl transition-all shadow-lg shadow-emerald-500/20"
                  >
                    Save Configuration
                  </button>
                </div>
                
                <p className="text-[10px] text-center text-white/20">
                  Your key is stored securely in localStorage and never sent to our servers.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-3">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl flex items-center gap-3 min-w-[300px] ${
                toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                'bg-white/10 border-white/10 text-white'
              }`}
            >
              {toast.type === 'success' && <Check size={18} />}
              {toast.type === 'error' && <AlertCircle size={18} />}
              {toast.type === 'info' && <Info size={18} />}
              <span className="text-xs font-bold uppercase tracking-widest">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Integrated AI Agent Chat */}
      <div className="fixed bottom-8 right-80 z-50">
        <AnimatePresence>
          {isAgentOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="w-96 h-[500px] bg-[#111] border border-white/10 rounded-[32px] shadow-2xl flex flex-col overflow-hidden mb-4"
            >
              <div className="p-6 border-b border-white/5 bg-emerald-500/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                    <Sparkles size={16} className="text-black" />
                  </div>
                  <div>
                    <p className="text-xs font-bold">Jewelry AI Assistant</p>
                    <p className="text-[10px] text-emerald-500/60 uppercase font-black tracking-widest">Online & Ready</p>
                  </div>
                </div>
                <button onClick={() => setIsAgentOpen(false)} className="text-white/20 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {agentMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-4 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'user' ? 'bg-emerald-500 text-black font-medium' : 'bg-white/5 text-white/80 border border-white/5'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isAgentThinking && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 p-4 rounded-2xl flex gap-1">
                      <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 bg-white/5 border-t border-white/5">
                <div className="relative">
                  <input 
                    type="text"
                    value={agentInput}
                    onChange={(e) => setAgentInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAgentChat()}
                    placeholder="Ask me to generate something..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-emerald-500/50 transition-all pr-12"
                  />
                  <button 
                    onClick={handleAgentChat}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-all"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={() => setIsAgentOpen(!isAgentOpen)}
          className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 ${
            isAgentOpen ? 'bg-white text-black' : 'bg-emerald-500 text-black'
          }`}
        >
          {isAgentOpen ? <X size={24} /> : <Sparkles size={24} />}
        </button>
      </div>
    </div>
  );
}
