# Feature and todo list

## Python Server.

-[x] Instead of using the [server](../src/doorstopServer.ts) which starts doorstop an than uses the doorstop cli -- replaced with a [FastAPI server](../server) wrapping the Doorstop Python API directly, one client, requests processed strictly one at a time.


## Canvas

[BUG] creating a new diagramm shall always create first a respective doorstop.json file and dann open that file. (by now one can not save a new diagramm)

[FEATUREs]:

- Add and remove an edge/links on the diagramm which are then also updated in the doorstop files
- show the elements in the hierachy of the respective documents, parents top, childs down
- color the elements by document, status, 
- add a new item directly on the diagramm. RTM on the element. than select the document by a quickselect, of the right document, create the element and add it to the canvas. 

## Doorstop Commands

- creating new elements shall always lead to Jumping to that elements.


## Editor

- get better overview of related elements
- for each linked element

## Treeview

each of the commads which is abailabile in the treeview as a icon to cklich shall also be available in the context menu.


## Document Preview.

RMT in the threeview to get rendered markdown view on to view a document or a part of a document 
