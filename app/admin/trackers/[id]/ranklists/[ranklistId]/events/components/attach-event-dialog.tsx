"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { CalendarPlus, Search, Loader2, Plus, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useDebounce } from "@/hooks/use-debounce";
import { getAvailableEvents, attachEventToRanklist } from "../../../actions";

interface Event {
  id: number;
  title: string;
  description?: string | null;
  startingAt: Date;
  type: string;
}

interface AttachEventDialogProps {
  ranklistId: number;
  onSuccess?: () => void;
}

export function AttachEventDialog({
  ranklistId,
  onSuccess,
}: AttachEventDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 500);
  const [isSearching, setIsSearching] = useState(false);
  const [isAttaching, setIsAttaching] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<Event[]>([]);
  const [eventWeights, setEventWeights] = useState<Record<number, string>>({});

  const handleSearch = useCallback(
    async (query = debouncedSearch) => {
      if (!query.trim() || query.length < 2) {
        setSearchResults([]);
        return;
      }
      try {
        setIsSearching(true);
        const response = await getAvailableEvents(ranklistId);
        if (response.success && response.data) {
          const events = response.data as Event[];
          // Filter events based on search query
          const filteredEvents = events.filter(
            (event) =>
              event.title.toLowerCase().includes(query.toLowerCase()) ||
              event.description?.toLowerCase().includes(query.toLowerCase()) ||
              event.type.toLowerCase().includes(query.toLowerCase())
          );
          setSearchResults(filteredEvents);
        } else {
          toast.error(response.error || "Failed to search events");
          setSearchResults([]);
        }
      } catch (error) {
        console.error(error);
        toast.error("An unexpected error occurred while searching");
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [debouncedSearch, ranklistId]
  );

  // Effect to trigger search when debounced search value changes
  useEffect(() => {
    if (debouncedSearch && debouncedSearch.trim().length >= 2) {
      handleSearch(debouncedSearch);
    } else {
      setSearchResults([]);
    }
  }, [debouncedSearch, handleSearch]);

  const handleAttachEvent = async (eventId: number) => {
    const weight = eventWeights[eventId] || "1.0";
    const weightValue = parseFloat(weight);

    if (isNaN(weightValue) || weightValue < 0.0 || weightValue > 1.0) {
      toast.error("Weight must be between 0.0 and 1.0");
      return;
    }

    try {
      setIsAttaching(eventId);
      const response = await attachEventToRanklist(
        ranklistId,
        eventId,
        weightValue
      );
      if (response.success) {
        toast.success("Event attached successfully");
        // Remove event from search results
        setSearchResults((prev) =>
          prev.filter((event) => event.id !== eventId)
        );
        // Remove weight from state
        setEventWeights((prev) => {
          const newWeights = { ...prev };
          delete newWeights[eventId];
          return newWeights;
        });
        // Refresh search if this was the only result
        if (searchResults.length === 1 && searchQuery.trim().length >= 2) {
          handleSearch(searchQuery);
        }
        onSuccess?.();
      } else {
        toast.error(response.error || "Failed to attach event");
      }
    } catch (error) {
      console.error(error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsAttaching(null);
    }
  };

  const updateEventWeight = (eventId: number, weight: string) => {
    setEventWeights((prev) => ({
      ...prev,
      [eventId]: weight,
    }));
  };

  const getEventTypeBadge = (type: string) => {
    switch (type) {
      case "contest":
        return <Badge variant="default">Contest</Badge>;
      case "class":
        return <Badge variant="secondary">Class</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim().length >= 2) {
      e.preventDefault();
      handleSearch(searchQuery);
    }
  };

  // Reset search when dialog is opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setSearchResults([]);
      setEventWeights({});
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <CalendarPlus className="h-4 w-4 mr-2" />
          Attach Event
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Attach Event to Ranklist</DialogTitle>
          <DialogDescription>
            Search for events to attach to this ranklist. You can search by
            title, description, or type.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-hidden">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search events (min. 2 characters)..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value === "") {
                  setSearchResults([]);
                }
              }}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div className="border rounded-lg bg-muted/30 flex-1 overflow-hidden">
            {isSearching ? (
              <div className="divide-y">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="p-3 space-y-3">
                    <div className="flex items-start space-x-3">
                      <Skeleton className="h-10 w-10 rounded flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-8 w-16" />
                      <Skeleton className="h-8 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : searchResults.length > 0 ? (
              <div className="max-h-[300px] overflow-y-auto">
                {searchResults.map((event) => (
                  <div
                    key={event.id}
                    className="p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors space-y-3"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="rounded bg-primary/10 p-2 flex-shrink-0">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {event.title}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {format(
                            new Date(event.startingAt),
                            "MMM dd, yyyy 'at' HH:mm"
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {getEventTypeBadge(event.type)}
                        </div>
                        {event.description && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {event.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          Weight:
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.0"
                          max="1.0"
                          placeholder="1.0"
                          value={eventWeights[event.id] || "1.0"}
                          onChange={(e) =>
                            updateEventWeight(event.id, e.target.value)
                          }
                          className="w-16 h-7 text-xs"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleAttachEvent(event.id)}
                        disabled={isAttaching === event.id}
                        className="h-7"
                      >
                        {isAttaching === event.id ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <Plus className="h-3 w-3 mr-1" />
                            Attach
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : searchQuery && searchQuery.length >= 2 && !isSearching ? (
              <div className="p-12 text-center">
                <div className="rounded-full bg-muted p-3 mx-auto w-fit">
                  <Search className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground mt-3">
                  No events found matching &quot;{searchQuery}&quot;
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try adjusting your search terms
                </p>
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="rounded-full bg-muted p-3 mx-auto w-fit">
                  <CalendarPlus className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground mt-3">
                  Start typing to search for events
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Search by title, description, or type
                </p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
