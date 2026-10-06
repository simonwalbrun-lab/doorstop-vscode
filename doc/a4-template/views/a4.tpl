%setdefault('has_index', True)
%setdefault('has_matrix', True)
% rebase('base.tpl', stylesheet='a4.css')
% if is_doc:
%   tmpRef='../'
% else:
%   tmpRef=''
% end
% if has_index or has_matrix:
<div class="native-nav">
  % if has_index:
  <a href="{{baseurl}}{{tmpRef}}index.html">Index</a>
  % end
  % if has_matrix:
  <a href="{{baseurl}}{{tmpRef}}traceability.html">Traceability matrix</a>
  % end
</div>
% end
% # Document-level fields can live on the document's first item instead of
% # attributes.defaults.doc in .doorstop.yml, so they don't leak onto every
% # new item created with `doorstop add`. Prefixed doc_* so they never collide
% # with real item fields (ref/text/header/level/... are reserved).
% cover = document.items[0] if (document and document.items) else None
% doctitle  = (cover.attribute('doc_title')    if cover else None) or doc_attributes["title"]
% docref    = (cover.attribute('doc_ref')      if cover else None) or doc_attributes["ref"]
% docby     = (cover.attribute('doc_by')       if cover else None) or doc_attributes["by"]
% docmajor  = (cover.attribute('doc_major')    if cover else None) or doc_attributes["major"]
% docminor  = (cover.attribute('doc_minor')    if cover else None) or doc_attributes["minor"]
% docreviewer = cover.attribute('doc_reviewer') if cover else None
% docapprover = cover.attribute('doc_approver') if cover else None
<div class="native-page">
  <div class="native-head">
    % if cover and cover.attribute('doc_title'):
    <div class="doctitle">{{doctitle}}</div>
    % else:
    <div class="doctitle">{{!doctitle}}</div>
    % end
    <div class="native-meta">
      <span><b>Doc</b>{{doc_attributes["name"]}}</span>
      <span><b>Ref</b>{{docref}}</span>
      <span><b>By</b>{{docby}}</span>
      <span><b>Issue</b>{{docmajor}}{{docminor}}</span>
      % if docreviewer:
      <span><b>Reviewer</b>{{docreviewer}}</span>
      % end
      % if docapprover:
      <span><b>Approver</b>{{docapprover}}</span>
      % end
      % if parent:
      <span><b>Parent</b><a href="{{parent}}.html">{{parent}}</a></span>
      % end
    </div>
  </div>

  % if toc:
  <nav class="native-toc">
    <p class="lbl">Contents</p>
    <ol>
      % for item in toc:
        % if item['uid'] != 'toc':
        <li class="lvl{{item['depth']}}"><a href="#{{item['uid']}}">{{item['text']}}</a></li>
        % end
      % end
    </ol>
  </nav>
  % end

  <div class="native-body">
    {{!body}}
  </div>

  <p class="native-end">&mdash; end of document &mdash;</p>
</div>
