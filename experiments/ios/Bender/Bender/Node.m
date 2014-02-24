//
//  Node.m
//  Bender
//
//  Created by Julien Quint on 2/24/14.
//  Copyright (c) 2014 IGEL, Co., Ltd. All rights reserved.
//

#import "Node.h"

@implementation Node

- (NSArray *)children {
    if (!_children) {
        _children = [[NSArray alloc] init];
    }
    return _children;
}

- (Node *)insertChild:(Node *)child {
    if (child.parent) {
        @throw @"Node already has a parent";
    }
    NSMutableArray *m = [self.children mutableCopy];
    [m addObject:child];
    self.children = [NSArray arrayWithArray:m];
    child.parent = self;
    return child;
}

@end